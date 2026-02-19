import { getPublicClient, readContractWithRetry } from "../viem.js";
import { FundVaultABI, FundRaiseABI, ERC20ABI, USDC_ADDRESS } from "../config.js";
import { isAddress } from "viem";
import {
  getFundByVault,
  getTotalDepositedFromEvents,
  getLatestCumulativeDrawn,
  getTotalManagementFees,
  getDepositorCount,
  type FundRecord,
} from "../db.js";
import { logger } from "../logger.js";

export interface FundStatsData {
  vault: string;
  status: string;
  totalDeposited: string;
  vaultBalance: string;
  deployedCapital: string;
  depositorCount: number;
  totalManagementFeesClaimed: string;
  cumulativeDrawn: string;
  drawdownAllowance: string;
  elapsedIntervals: number;
  activated: boolean;
  fundFrozen: boolean;
  fundWindingDown: boolean;
}

/**
 * Get fund statistics. Uses a 3-path strategy to minimize RPC calls:
 *
 * Path A — DB-optimized (1 RPC): activated fund with cached activation params
 * Path B — Raising/cancelled (1 RPC): fund with deposit_end but no activation params
 * Path C — Fallback (14 RPC): pre-migration fund without any cached params
 */
export async function getFundStats(vaultAddress: string): Promise<FundStatsData> {
  if (!isAddress(vaultAddress)) {
    throw new Error(`Invalid vault address: ${vaultAddress}`);
  }

  const fund = getFundByVault(vaultAddress);

  // Path A: activated fund with cached activation params (1 RPC call)
  // Defensive: skip Path A if DB status is inconsistent with cached activation params
  if (fund?.initial_deposits != null && fund.status !== "raising" && fund.status !== "cancelled") {
    try {
      logger.debug({ event: "fund_stats_path_a", vault: vaultAddress });
      return await getFundStatsPathA(vaultAddress, fund);
    } catch (err) {
      logger.warn({ event: "fund_stats_path_a_fallback", vault: vaultAddress, error: err instanceof Error ? err.message : String(err) });
      return getFundStatsPathC(vaultAddress);
    }
  }

  // Path B: raising/cancelled fund with deposit_end cached (1 RPC call)
  if (fund?.deposit_end != null) {
    logger.debug({ event: "fund_stats_path_b", vault: vaultAddress });
    return getFundStatsPathB(vaultAddress, fund);
  }

  // Path C: fallback — no cached params (14 RPC calls)
  logger.debug({ event: "fund_stats_path_c", vault: vaultAddress });
  return getFundStatsPathC(vaultAddress);
}

/**
 * Path A — DB-optimized path for activated funds (1 RPC call: balanceOf only).
 * All other data comes from indexed events and cached activation params.
 */
async function getFundStatsPathA(vaultAddress: string, fund: FundRecord): Promise<FundStatsData> {
  // Single RPC call — vault USDC balance
  const vaultBalance = await readContractWithRetry({
    address: USDC_ADDRESS,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: [vaultAddress],
  }) as bigint;

  // Derive status from DB status column
  const activated = !["raising", "cancelled"].includes(fund.status);
  const fundFrozen = fund.status === "frozen";
  const fundWindingDown = fund.status === "winding_down";

  // Derive status string (with "failed" detection)
  let status: string;
  if (fundFrozen) {
    status = "frozen";
  } else if (fundWindingDown) {
    status = "winding_down";
  } else {
    status = "active";
  }

  // Event aggregation from DB
  const totalDeposited = getTotalDepositedFromEvents(vaultAddress);
  const cumulativeDrawn = getLatestCumulativeDrawn(vaultAddress);
  const totalManagementFeesClaimed = getTotalManagementFees(vaultAddress);
  const depositorCount = getDepositorCount(vaultAddress);

  // Cached activation params
  const initialDeposits = BigInt(fund.initial_deposits!);
  const drawdownIntervalSeconds = fund.drawdown_interval_seconds!;
  const fundStartTime = fund.fund_start_time!;

  // Calculate deployed capital (clamped to 0)
  const deployedCapital = initialDeposits > vaultBalance ? initialDeposits - vaultBalance : 0n;

  // Calculate drawdown allowance (clamp to 0 if clock skew)
  const now = Math.floor(Date.now() / 1000);
  const elapsedTime = Math.max(0, now - fundStartTime);
  const elapsedIntervals = drawdownIntervalSeconds > 0
    ? Math.floor(elapsedTime / drawdownIntervalSeconds)
    : 0;
  const drawdownAllowance = (BigInt(elapsedIntervals) * initialDeposits) / 10n;

  return {
    vault: vaultAddress,
    status,
    totalDeposited,
    vaultBalance: vaultBalance.toString(),
    deployedCapital: deployedCapital.toString(),
    depositorCount,
    totalManagementFeesClaimed,
    cumulativeDrawn,
    drawdownAllowance: drawdownAllowance.toString(),
    elapsedIntervals,
    activated,
    fundFrozen,
    fundWindingDown,
  };
}

/**
 * Path B — Raising/cancelled funds (1 RPC call: balanceOf only).
 * Most fields are zero for these funds since they haven't been activated.
 */
async function getFundStatsPathB(vaultAddress: string, fund: FundRecord): Promise<FundStatsData> {
  // Single RPC call — vault USDC balance
  const vaultBalance = await readContractWithRetry({
    address: USDC_ADDRESS,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: [vaultAddress],
  }) as bigint;

  // Event aggregation from DB
  const totalDeposited = getTotalDepositedFromEvents(vaultAddress);
  const depositorCount = getDepositorCount(vaultAddress);

  // Derive status — detect "failed" (deposit window passed without finalisation)
  let status: string;
  if (fund.status === "cancelled") {
    status = "cancelled";
  } else {
    const now = Math.floor(Date.now() / 1000);
    if (fund.deposit_end! < now && fund.status === "raising") {
      status = "failed";
    } else {
      status = "raising";
    }
  }

  return {
    vault: vaultAddress,
    status,
    totalDeposited,
    vaultBalance: vaultBalance.toString(),
    deployedCapital: "0",
    depositorCount,
    totalManagementFeesClaimed: "0",
    cumulativeDrawn: "0",
    drawdownAllowance: "0",
    elapsedIntervals: 0,
    activated: false,
    fundFrozen: false,
    fundWindingDown: false,
  };
}

/**
 * Path C — Fallback for pre-migration funds (14 RPC calls).
 * Verbatim from the original implementation. Backfill eliminates this path on next startup.
 */
async function getFundStatsPathC(vaultAddress: string): Promise<FundStatsData> {
  const client = getPublicClient();
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });

  // Read vault state
  const [
    activated,
    fundFrozen,
    fundWindingDown,
    initialDeposits,
    cumulativeDrawn,
    totalManagementFeesClaimed,
    drawdownIntervalSeconds,
    fundStartTime,
    raiseAddress,
  ] = await Promise.all([
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "activated",
      blockNumber,
    }) as Promise<boolean>,
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "fundFrozen",
      blockNumber,
    }) as Promise<boolean>,
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "fundWindingDown",
      blockNumber,
    }) as Promise<boolean>,
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "initialDeposits",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "cumulativeDrawn",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "totalManagementFeesClaimed",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "drawdownIntervalSeconds",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "fundStartTime",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "raiseContract",
      blockNumber,
    }) as Promise<string>,
  ]);

  // Read raise state and USDC balance in parallel
  const [totalDeposited, cancelled, finalised, vaultBalance] = await Promise.all([
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "totalDeposited",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "cancelled",
      blockNumber,
    }) as Promise<boolean>,
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "finalised",
      blockNumber,
    }) as Promise<boolean>,
    readContractWithRetry({
      address: USDC_ADDRESS,
      abi: ERC20ABI,
      functionName: "balanceOf",
      args: [vaultAddress],
      blockNumber,
    }) as Promise<bigint>,
  ]);

  // Derive status
  let status: string;
  if (!activated) {
    if (cancelled) {
      status = "cancelled";
    } else {
      const now = Math.floor(Date.now() / 1000);
      const [depositEnd] = await Promise.all([
        readContractWithRetry({
          address: raiseAddress as `0x${string}`,
          abi: FundRaiseABI,
          functionName: "depositEnd",
          blockNumber,
        }) as Promise<bigint>,
      ]);
      if (Number(depositEnd) < now && !finalised) {
        status = "failed";
      } else {
        status = "raising";
      }
    }
  } else {
    if (fundFrozen) {
      status = "frozen";
    } else if (fundWindingDown) {
      status = "winding_down";
    } else {
      status = "active";
    }
  }

  // Calculate deployed capital (clamped to 0)
  const deployedCapital = initialDeposits > vaultBalance ? initialDeposits - vaultBalance : 0n;

  // Count depositors from events table
  const depositorCount = getDepositorCount(vaultAddress);

  // Calculate drawdown allowance
  const now = Math.floor(Date.now() / 1000);
  const elapsedTime = BigInt(now) - fundStartTime;
  const elapsedIntervals = drawdownIntervalSeconds > 0n
    ? Number(elapsedTime / drawdownIntervalSeconds)
    : 0;
  const drawdownAllowance = (BigInt(elapsedIntervals) * initialDeposits) / 10n;

  return {
    vault: vaultAddress,
    status,
    totalDeposited: totalDeposited.toString(),
    vaultBalance: vaultBalance.toString(),
    deployedCapital: deployedCapital.toString(),
    depositorCount,
    totalManagementFeesClaimed: totalManagementFeesClaimed.toString(),
    cumulativeDrawn: cumulativeDrawn.toString(),
    drawdownAllowance: drawdownAllowance.toString(),
    elapsedIntervals,
    activated,
    fundFrozen,
    fundWindingDown,
  };
}
