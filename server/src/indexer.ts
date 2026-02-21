import { decodeEventLog } from "viem";
import { getPublicClient, readContractWithRetry } from "./viem.js";
import { fetchMetadata } from "./resources/utils.js";
import { logger } from "./logger.js";
import { broadcast, refreshWallet } from "./sseManager.js";
import {
  getDb,
  insertFund,
  insertEvent,
  insertActivityLine,
  insertVaultParticipant,
  getAllFunds,
  getLastIndexedBlock,
  setLastIndexedBlock,
  updateFundStatus,
  updateFundParamsDb,
  updateFundActivationParamsDb,
  type FundStatus,
} from "./db.js";
import {
  FACTORY_ADDRESS,
  START_BLOCK,
  POLL_INTERVAL_MS,
  FundFactoryABI,
  FundVaultABI,
  FundRaiseABI,
  ADAPTER_BY_ADDRESS,
} from "./config.js";
import { decodeAdapterCall } from "./adapterCodec.js";
import { randomUUID } from "node:crypto";

// ── Activity line formatting helpers ──────────────────────────────

function truncAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUSDCAmount(raw: string): string {
  const n = Number(BigInt(raw)) / 1e6;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function formatTimestampShort(ts: number | string): string {
  const d = new Date(Number(ts) * 1000);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function formatActivityLine(event: {
  event_name: string;
  decoded: string;
  block_number: number;
  timestamp: number;
}): { line1: string; line2: string | null } {
  const d = JSON.parse(event.decoded);
  switch (event.event_name) {
    case "Deposit":
      return {
        line1: `deposit: {green}${formatUSDCAmount(d.amount)} USDC{/green} from ${truncAddr(d.depositor)}`,
        line2: `— confirmed block #${event.block_number.toLocaleString()}`,
      };
    case "Refund":
      return {
        line1: `withdrawal: {amber}${formatUSDCAmount(d.amount)} USDC{/amber} by ${truncAddr(d.depositor)}`,
        line2: `— deposit refunded`,
      };
    case "FundFinalised":
      return {
        line1: `fund_finalised: {green}${formatUSDCAmount(d.totalDeposited)} USDC raised{/green}`,
        line2: `— ${d.totalShares} shares minted, fund deploying`,
      };
    case "FundActivated":
      return {
        line1: `fund_activated: {green}capital deployed{/green}`,
        line2: `— ${formatUSDCAmount(d.usdcReceived)} USDC transferred to vault`,
      };
    case "ProposalCreated": {
      const line1 = d.type === "adapter"
        ? `proposal #${d.id}: {green}${d.adapterName}: ${d.action}{/green}`
        : `proposal #${d.id}: {amber}raw call to ${truncAddr(d.target)}{/amber}`;
      return {
        line1,
        line2: `— executableAt ${formatTimestampShort(d.executableAt)}`,
      };
    }
    case "FundWindDown":
      return { line1: `fund_winding_down: {amber}withdrawals open{/amber}`, line2: null };
    case "FundFrozenEvent":
      return { line1: `fund_frozen: {amber}emergency freeze activated{/amber}`, line2: `— manager transferred` };
    case "FundCancelled":
    case "FundCancelledPreExecution":
      return { line1: `fund_cancelled: {amber}deposits refundable{/amber}`, line2: null };
    case "FreezeVoteCast":
      return {
        line1: `freeze_vote: {amber}${formatUSDCAmount(d.shares)} shares{/amber} by ${truncAddr(d.voter)}`,
        line2: null,
      };
    case "FundCreated":
      return {
        line1: `fund_created: {green}new fund deployed{/green}`,
        line2: `— vault: ${truncAddr(d.vault)}, raise: ${truncAddr(d.raise)}`,
      };
    case "TokenTransferredToAdapter":
      return {
        line1: `adapter_transfer: {green}${formatUSDCAmount(d.amount)} to ${truncAddr(d.adapter)}{/green}`,
        line2: null,
      };
    case "DebtDelegationApproved":
      return {
        line1: `debt_delegation: {amber}approved for ${truncAddr(d.adapter)}{/amber}`,
        line2: null,
      };
    case "AdapterRegistered":
      return {
        line1: `adapter_registered: {green}${d.identifier} at ${truncAddr(d.adapter)}{/green}`,
        line2: null,
      };
    case "AdapterRemoved":
      return {
        line1: `adapter_removed: {amber}${truncAddr(d.adapter)}{/amber}`,
        line2: null,
      };
    case "DrawdownUpdated":
      return {
        line1: `drawdown: {amber}${formatUSDCAmount(d.cumulativeDrawn)} drawn{/amber}`,
        line2: `— allowance: ${formatUSDCAmount(d.currentAllowance)}, interval: ${d.intervalsElapsed}`,
      };
    case "ProposalExecuted":
      return {
        line1: `proposal_executed: {green}#${d.proposalId}{/green}`,
        line2: null,
      };
    case "ResidualClaimed":
      return {
        line1: `residual_claimed: {green}${formatUSDCAmount(d.payout)} USDC{/green} by ${truncAddr(d.lp)}`,
        line2: null,
      };
    default:
      return { line1: `${event.event_name.toLowerCase()}`, line2: null };
  }
}

// Mutex guard to prevent concurrent poll() invocations
let polling = false;

// Track last successful poll time for health checks
let lastPollTime: number | null = null;

/**
 * Returns indexer state for health/admin endpoints.
 * Uses the existing getLastIndexedBlock from db.ts for cursor,
 * and in-memory lastPollTime for recency.
 */
export function getIndexerState(): { lastIndexedBlock: string | null; lastPollTime: number | null } {
  const row = getLastIndexedBlock();
  return {
    lastIndexedBlock: row !== null ? String(row) : null,
    lastPollTime,
  };
}

export function decodeFunctionSelector(calldata: string): string {
  return calldata.slice(0, 10);
}

// Helper to convert all bigint values to strings
function stringifyBigInts(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === "bigint" ? value.toString() : value;
  }
  return result;
}

interface NewFund {
  vault: string;
  raise: string;
  manager: string;
  created_at_block: number;
  status: FundStatus;
}

interface NewEvent {
  vault: string;
  event_name: string;
  block_number: number;
  timestamp: number;
  tx_hash: string;
  decoded: string;
}

interface StatusUpdate {
  vault: string;
  status: FundStatus;
}

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  payload: string;
  status: "pending";
  attempts: number;
  next_retry_at: number;
  created_at: number;
}

export async function poll(): Promise<void> {
  if (polling) {
    logger.warn({ event: "indexer_poll_skipped", reason: "previous poll still running" });
    return;
  }
  polling = true;
  try {
    const client = getPublicClient();

    // Get last indexed block or start from configured block
    const lastIndexed = getLastIndexedBlock();
    const fromBlock = lastIndexed !== null ? lastIndexed + 1n : START_BLOCK;

    // Get latest block number
    const latestBlock = await client.getBlockNumber();

    // No new blocks
    if (fromBlock > latestBlock) {
      return;
    }

    logger.info({ event: "indexer_polling", fromBlock: String(fromBlock), toBlock: String(latestBlock), blocks: String(latestBlock - fromBlock + 1n) });

    // RPC limits: chunk into 2000 block segments
    const CHUNK_SIZE = 2000n;
    const newFunds: NewFund[] = [];
    const newEvents: NewEvent[] = [];
    const statusUpdates: Map<string, FundStatus> = new Map();
    const webhookDeliveries: WebhookDelivery[] = [];
    const activationParamUpdates: Map<string, { initial_deposits: string; fund_start_time: number; drawdown_interval_seconds: number }> = new Map();

    // Block timestamp cache
    const blockTimestamps: Map<bigint, number> = new Map();

    async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
      if (!blockTimestamps.has(blockNumber)) {
        const block = await client.getBlock({ blockNumber });
        blockTimestamps.set(blockNumber, Number(block.timestamp));
      }
      return blockTimestamps.get(blockNumber)!;
    }

    // Process in chunks
    for (let chunkStart = fromBlock; chunkStart <= latestBlock; chunkStart += CHUNK_SIZE) {
      const chunkEnd = chunkStart + CHUNK_SIZE - 1n > latestBlock
        ? latestBlock
        : chunkStart + CHUNK_SIZE - 1n;

      logger.debug({ event: "indexer_chunk", from: String(chunkStart), to: String(chunkEnd) });

      // 1. Fetch factory events (FundCreated)
      const factoryLogs = await client.getLogs({
        address: FACTORY_ADDRESS,
        fromBlock: chunkStart,
        toBlock: chunkEnd,
        event: {
          type: "event",
          name: "FundCreated",
          inputs: [
            { type: "address", indexed: true, name: "raise" },
            { type: "address", indexed: true, name: "vault" },
            { type: "address", indexed: true, name: "manager" },
            { type: "uint256", indexed: false, name: "maxRaise" },
            { type: "uint64", indexed: false, name: "fundDuration" },
          ],
        },
      });

      for (const log of factoryLogs) {
        const timestamp = await getBlockTimestamp(log.blockNumber);

        newFunds.push({
          vault: log.args.vault as string,
          raise: log.args.raise as string,
          manager: log.args.manager as string,
          created_at_block: Number(log.blockNumber),
          status: "raising",
        });

        newEvents.push({
          vault: log.args.vault as string,
          event_name: "FundCreated",
          block_number: Number(log.blockNumber),
          timestamp,
          tx_hash: log.transactionHash as string,
          decoded: JSON.stringify(
            stringifyBigInts({
              raise: log.args.raise,
              vault: log.args.vault,
              manager: log.args.manager,
              maxRaise: log.args.maxRaise,
              fundDuration: log.args.fundDuration,
            })
          ),
        });
      }

      // 2. Get all known funds (existing + newly discovered in this batch)
      const existingFunds = getAllFunds();
      const allKnownFunds = [
        ...existingFunds,
        ...newFunds.filter(
          (nf) => !existingFunds.some((ef) => ef.vault === nf.vault)
        ),
      ];

      // 3. Fetch per-fund events from both vault and raise contracts
      for (const fund of allKnownFunds) {
        // Vault events
        const vaultLogs = await client.getLogs({
          address: fund.vault as `0x${string}`,
          fromBlock: chunkStart,
          toBlock: chunkEnd,
          // We'll decode manually using the ABI
        });

        for (const log of vaultLogs) {
          // Decode the log using the Vault ABI
          let decoded;
          try {
            decoded = decodeEventLog({
              abi: FundVaultABI,
              data: log.data,
              topics: log.topics,
            });
          } catch {
            // Skip logs that don't match any event in the ABI
            continue;
          }

          const eventName = decoded.eventName;
          const timestamp = await getBlockTimestamp(log.blockNumber);

          // Build decoded payload
          let decodedPayload: Record<string, unknown> = decoded.args ? stringifyBigInts(decoded.args as any) : {};

          // Dual-path ProposalCreated decoding
          if (eventName === "ProposalCreated" && decoded.args) {
            const args = decoded.args as any;
            const target = args.target as string;
            const calldata_ = (args.data || args.calldata_) as string;
            const isAdapter = !!ADAPTER_BY_ADDRESS[target.toLowerCase()];

            if (isAdapter) {
              const adapterDecoded = decodeAdapterCall(target, calldata_ as `0x${string}`);
              decodedPayload = {
                ...decodedPayload,
                type: "adapter",
                adapterName: adapterDecoded?.adapterName ?? "unknown",
                action: adapterDecoded?.action ?? "unknown",
                params: adapterDecoded?.params ?? {},
              };
            } else {
              decodedPayload = {
                ...decodedPayload,
                type: "raw_call",
                selector: calldata_ ? calldata_.slice(0, 10) : "0x",
              };
            }

            // Webhook deliveries for ProposalCreated
            const db = getDb();
            const webhooks = db
              .prepare("SELECT * FROM webhooks WHERE vault = ?")
              .all(fund.vault) as Array<{
              id: string;
              vault: string;
              callback_url: string;
            }>;

            for (const webhook of webhooks) {
              const payload = {
                event: "ProposalCreated",
                fundVault: fund.vault,
                proposalId: args.id?.toString() ?? "0",
                type: isAdapter ? "adapter" : "raw_call",
                target,
                ...(isAdapter && {
                  adapterName: (decodedPayload as any).adapterName,
                  action: (decodedPayload as any).action,
                  decodedParams: (decodedPayload as any).params,
                }),
                ...(!isAdapter && {
                  calldata: calldata_,
                }),
                value: args.value?.toString() ?? "0",
                executableAt: args.executableAt?.toString() ?? "0",
                timestamp,
              };

              webhookDeliveries.push({
                id: randomUUID(),
                webhook_id: webhook.id,
                payload: JSON.stringify(payload),
                status: "pending",
                attempts: 0,
                next_retry_at: Date.now(),
                created_at: Date.now(),
              });
            }
          }

          newEvents.push({
            vault: fund.vault,
            event_name: String(eventName),
            block_number: Number(log.blockNumber),
            timestamp,
            tx_hash: log.transactionHash as string,
            decoded: JSON.stringify(decodedPayload),
          });

          // Status updates
          if (eventName === "FundWindDown") {
            statusUpdates.set(fund.vault, "winding_down");
          } else if (eventName === "FundFrozenEvent") {
            statusUpdates.set(fund.vault, "frozen");
          } else if (eventName === "FundCancelledPreExecution") {
            statusUpdates.set(fund.vault, "cancelled");
          }

          // Cache activation params when fund activates — read from contract
          // for consistency with the backfill path (both use on-chain values)
          if (eventName === "FundActivated" && decoded.args) {
            const args = decoded.args as any;
            const usdcReceived = args.usdcReceived;
            try {
              const [drawdownInterval, startTime] = await Promise.all([
                readContractWithRetry({
                  address: fund.vault as `0x${string}`,
                  abi: FundVaultABI,
                  functionName: "drawdownIntervalSeconds",
                }),
                readContractWithRetry({
                  address: fund.vault as `0x${string}`,
                  abi: FundVaultABI,
                  functionName: "fundStartTime",
                }),
              ]);
              activationParamUpdates.set(fund.vault, {
                initial_deposits: String(usdcReceived),
                fund_start_time: Number(startTime),
                drawdown_interval_seconds: Number(drawdownInterval),
              });
            } catch (err) {
              logger.error({ event: "indexer_activation_params_failed", vault: fund.vault, error: err instanceof Error ? err.message : String(err) });
              // Backfill catches it on next restart
            }
          }
        }

        // Raise events
        const raiseLogs = await client.getLogs({
          address: fund.raise as `0x${string}`,
          fromBlock: chunkStart,
          toBlock: chunkEnd,
        });

        for (const log of raiseLogs) {
          let decoded;
          try {
            decoded = decodeEventLog({
              abi: FundRaiseABI,
              data: log.data,
              topics: log.topics,
            });
          } catch {
            // Skip logs that don't match any event in the ABI
            continue;
          }

          const eventName = decoded.eventName;
          const timestamp = await getBlockTimestamp(log.blockNumber);

          newEvents.push({
            vault: fund.vault,
            event_name: String(eventName),
            block_number: Number(log.blockNumber),
            timestamp,
            tx_hash: log.transactionHash as string,
            decoded: JSON.stringify(stringifyBigInts(decoded.args as any)),
          });

          // Status updates
          if (eventName === "FundFinalised") {
            statusUpdates.set(fund.vault, "active");
          } else if (eventName === "FundCancelled") {
            statusUpdates.set(fund.vault, "cancelled");
          }
        }
      }
    }

    // 4. Write everything atomically
    const db = getDb();
    const pendingBroadcasts: { eventName: string; vault: string; eventId: number; decoded: string; timestamp: number }[] = [];
    const writeAll = db.transaction(() => {
      // Insert new funds
      for (const fund of newFunds) {
        insertFund(fund);
      }

      // Insert events and collect IDs for SSE broadcast
      for (const event of newEvents) {
        const eventId = insertEvent(event);
        if (eventId > 0) {
          pendingBroadcasts.push({
            eventName: event.event_name,
            vault: event.vault,
            eventId,
            decoded: event.decoded,
            timestamp: event.timestamp,
          });
        }
      }

      // Insert vault participants for new funds (manager) and Deposit events (depositor)
      for (const fund of newFunds) {
        insertVaultParticipant(fund.vault, fund.manager, "manager");
      }
      for (const event of newEvents) {
        if (event.event_name === "Deposit") {
          const depositor = JSON.parse(event.decoded).depositor;
          if (depositor) insertVaultParticipant(event.vault, depositor, "depositor");
        }
      }

      // Update fund statuses
      for (const [vault, status] of statusUpdates.entries()) {
        updateFundStatus(vault, status);
      }

      // Cache activation params for newly activated funds
      for (const [vault, params] of activationParamUpdates.entries()) {
        updateFundActivationParamsDb(vault, params);
      }

      // Insert webhook deliveries
      const insertDeliveryStmt = db.prepare(
        `INSERT INTO webhook_deliveries
         (id, webhook_id, payload, status, attempts, next_retry_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const delivery of webhookDeliveries) {
        insertDeliveryStmt.run(
          delivery.id,
          delivery.webhook_id,
          delivery.payload,
          delivery.status,
          delivery.attempts,
          delivery.next_retry_at,
          delivery.created_at
        );
      }

      // Update cursor
      setLastIndexedBlock(latestBlock);
    });

    writeAll();

    // SSE broadcast (after commit — safe to push to connected agents)
    for (const p of pendingBroadcasts) {
      broadcast(p.eventName, p.vault, p.eventId, {
        vault: p.vault,
        ...JSON.parse(p.decoded),
        timestamp: p.timestamp,
      });
    }
    // Refresh vault subscriptions for affected wallets
    for (const p of pendingBroadcasts) {
      if (p.eventName === "Deposit") {
        const decoded = JSON.parse(p.decoded);
        if (decoded.depositor) refreshWallet(decoded.depositor);
      }
      if (p.eventName === "FundFinalised") {
        const fund = db.prepare("SELECT manager FROM funds WHERE vault = ?").get(p.vault) as { manager: string } | undefined;
        if (fund?.manager) refreshWallet(fund.manager);
      }
    }

    // Generate activity lines for newly indexed events
    for (const event of newEvents) {
      try {
        const { line1, line2 } = formatActivityLine(event);
        insertActivityLine(event.vault, event.block_number, event.timestamp, line1, line2);
      } catch (err) {
        logger.error({ event: "indexer_activity_line_failed", eventName: event.event_name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Cache immutable params + warm metadata for newly discovered funds (fire-and-forget)
    if (newFunds.length > 0) {
      for (const fund of newFunds) {
        Promise.all([
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "minRaise" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "maxRaise" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "depositStart" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "depositEnd" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "managementFeeBps" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "performanceFeeBps" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "fundDuration" }),
          readContractWithRetry({ address: fund.raise as `0x${string}`, abi: FundRaiseABI, functionName: "metadataURI" }),
        ])
          .then(([minRaise, maxRaise, depositStart, depositEnd, mgmtFee, perfFee, duration, uri]) => {
            if (minRaise != null && maxRaise != null) {
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
              logger.info({ event: "indexer_cached_params", vault: fund.vault });
            }
            if (uri && typeof uri === "string" && uri.startsWith("ipfs://")) {
              return fetchMetadata(uri);
            }
          })
          .catch((err) =>
            logger.error({ event: "indexer_warmup_failed", vault: fund.vault, error: err instanceof Error ? err.message : String(err) })
          );
      }
    }

    lastPollTime = Date.now();
    logger.info({ event: "indexer_poll_complete", toBlock: String(latestBlock), newFunds: newFunds.length, events: newEvents.length, statusUpdates: statusUpdates.size, webhookDeliveries: webhookDeliveries.length });
  } catch (error) {
    if (process.env.NODE_ENV === 'test') {
      logger.error({ event: "indexer_poll_error_test", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    logger.error({ event: "indexer_poll_error", error: error instanceof Error ? error.message : String(error) });
    // Never crash - just log and continue
  } finally {
    polling = false;
  }
}

export function startIndexer(): void {
  logger.info({ event: "indexer_started" });

  // Poll immediately
  poll();

  // Then poll at regular intervals
  setInterval(() => {
    poll();
  }, POLL_INTERVAL_MS);
}
