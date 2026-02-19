import { readContractWithRetry } from "../viem.js";
import { FundRaiseABI, FundVaultABI } from "../config.js";
import {
  getDb,
  getAllFunds,
  getEventsByVault,
  getFundsWithoutParams,
  getFundsWithoutActivationParams,
  updateFundParamsDb,
  updateFundActivationParamsDb,
  insertActivityLine,
} from "../db.js";
import { formatActivityLine } from "../indexer.js";
import { fetchMetadata } from "./utils.js";
import { logger } from "../logger.js";

/**
 * Backfill immutable fund params for funds discovered before this feature was deployed.
 * Reads params from chain and writes to SQLite. No-op if all funds already have params.
 * Fire-and-forget — does not block startup.
 */
export async function backfillFundParams(): Promise<void> {
  const funds = getFundsWithoutParams();
  if (funds.length === 0) {
    logger.info({ event: "backfill_params_skipped", reason: "all funds cached" });
    return;
  }

  logger.info({ event: "backfill_params_start", count: funds.length });

  for (const fund of funds) {
    try {
      const [minRaise, maxRaise, depositStart, depositEnd, mgmtFee, perfFee, duration, uri] =
        await Promise.all([
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "minRaise" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "maxRaise" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "depositStart" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "depositEnd" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "managementFeeBps" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "performanceFeeBps" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "fundDuration" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "metadataURI" }),
        ]);

      updateFundParamsDb(fund.vault, {
        min_raise: String(minRaise),
        max_raise: String(maxRaise),
        deposit_start: Number(depositStart),
        deposit_end: Number(depositEnd),
        management_fee_bps: Number(mgmtFee),
        performance_fee_bps: Number(perfFee),
        fund_duration: String(duration),
        metadata_uri: String(uri),
      });

      // Also warm metadata cache
      if (uri && typeof uri === "string" && (uri as string).startsWith("ipfs://")) {
        await fetchMetadata(uri as string);
      }

      logger.info({ event: "backfill_params_cached", vault: fund.vault });
    } catch (err) {
      logger.error({ event: "backfill_params_failed", vault: fund.vault, error: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info({ event: "backfill_params_complete" });
}

/**
 * Backfill activation params (initialDeposits, drawdownIntervalSeconds, fundStartTime)
 * for funds that have been activated but don't have cached params yet.
 * These values are immutable once set at fund activation.
 * Fire-and-forget — does not block startup.
 */
export async function backfillActivationParams(): Promise<void> {
  const funds = getFundsWithoutActivationParams();
  if (funds.length === 0) {
    logger.info({ event: "backfill_activation_skipped", reason: "all activated funds cached" });
    return;
  }

  logger.info({ event: "backfill_activation_start", count: funds.length });

  for (const fund of funds) {
    try {
      const [initialDeposits, drawdownIntervalSeconds, fundStartTime] =
        await Promise.all([
          readContractWithRetry({ address: fund.vault as `0x${string}`, abi: FundVaultABI, functionName: "initialDeposits" }),
          readContractWithRetry({ address: fund.vault as `0x${string}`, abi: FundVaultABI, functionName: "drawdownIntervalSeconds" }),
          readContractWithRetry({ address: fund.vault as `0x${string}`, abi: FundVaultABI, functionName: "fundStartTime" }),
        ]);

      updateFundActivationParamsDb(fund.vault, {
        initial_deposits: String(initialDeposits),
        drawdown_interval_seconds: Number(drawdownIntervalSeconds),
        fund_start_time: Number(fundStartTime),
      });

      logger.info({ event: "backfill_activation_cached", vault: fund.vault });
    } catch (err) {
      logger.error({ event: "backfill_activation_failed", vault: fund.vault, error: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info({ event: "backfill_activation_complete" });
}

/**
 * Backfill activity_lines for funds that have events but no activity lines yet.
 * Runs the same formatter used at indexer time. One-time migration.
 */
export function backfillActivityLines(): void {
  const db = getDb();
  const funds = getAllFunds();
  let totalInserted = 0;

  for (const fund of funds) {
    // Check if this fund already has activity lines
    const existing = db
      .prepare("SELECT COUNT(*) as cnt FROM activity_lines WHERE vault = ?")
      .get(fund.vault) as { cnt: number };
    if (existing.cnt > 0) continue;

    // Get all events for this fund
    const events = getEventsByVault(fund.vault);
    for (const event of events) {
      try {
        const { line1, line2 } = formatActivityLine({
          event_name: event.event_name,
          decoded: event.decoded,
          block_number: event.block_number,
          timestamp: event.timestamp,
        });
        insertActivityLine(fund.vault, event.block_number, event.timestamp, line1, line2);
        totalInserted++;
      } catch {
        // Skip events that fail to format
      }
    }
  }

  if (totalInserted > 0) {
    logger.info({ event: "backfill_activity_complete", inserted: totalInserted });
  } else {
    logger.info({ event: "backfill_activity_skipped", reason: "already up to date" });
  }
}
