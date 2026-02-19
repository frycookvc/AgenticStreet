import { getPublicClient, readContractWithRetry } from "../viem.js";
import { FundRaiseABI, ERC20ABI, USDC_ADDRESS } from "../config.js";
import { getAllFunds, type FundRecord, type FundStatus } from "../db.js";
import { getCachedMetadata } from "./utils.js";

export interface FundListItem {
  vault: string;
  raise: string;
  manager: string;
  status: FundStatus;
  totalDeposited: string;
  vaultBalance: string;
  minRaise: string;
  maxRaise: string;
  depositStart: number;
  depositEnd: number;
  managementFeeBps: number;
  performanceFeeBps: number;
  fundDuration: string;
  metadataURI: string;
  metadata: object | null;
}

export interface FundsListData {
  funds: FundListItem[];
}

/**
 * Build a FundListItem using cached immutable params from SQLite.
 * Only makes 2 RPC calls (totalDeposited + vaultBalance).
 */
async function buildFromCache(
  fund: FundRecord,
  blockNumber: bigint
): Promise<FundListItem> {
  const [totalDeposited, vaultBalance] = await Promise.all([
    readContractWithRetry({
      address: fund.raise as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "totalDeposited",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: USDC_ADDRESS,
      abi: ERC20ABI,
      functionName: "balanceOf",
      args: [fund.vault],
      blockNumber,
    }) as Promise<bigint>,
  ]);

  const metadata = getCachedMetadata(fund.metadata_uri!);

  return {
    vault: fund.vault,
    raise: fund.raise,
    manager: fund.manager,
    status: fund.status,
    totalDeposited: totalDeposited.toString(),
    vaultBalance: vaultBalance.toString(),
    minRaise: fund.min_raise!,
    maxRaise: fund.max_raise!,
    depositStart: fund.deposit_start!,
    depositEnd: fund.deposit_end!,
    managementFeeBps: fund.management_fee_bps!,
    performanceFeeBps: fund.performance_fee_bps!,
    fundDuration: fund.fund_duration!,
    metadataURI: fund.metadata_uri!,
    metadata,
  };
}

/**
 * Build a FundListItem by reading all params from chain (fallback).
 * Makes 10 RPC calls — used only before backfill populates the cache.
 */
async function buildFromChain(
  fund: FundRecord,
  blockNumber: bigint
): Promise<FundListItem> {
  const [
    totalDeposited,
    vaultBalance,
    minRaise,
    maxRaise,
    depositStart,
    depositEnd,
    managementFeeBps,
    performanceFeeBps,
    fundDuration,
    metadataURI,
  ] = await Promise.all([
    readContractWithRetry({
      address: fund.raise as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "totalDeposited",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: USDC_ADDRESS,
      abi: ERC20ABI,
      functionName: "balanceOf",
      args: [fund.vault],
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: fund.raise as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "minRaise",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: fund.raise as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "maxRaise",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: fund.raise as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "depositStart",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: fund.raise as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "depositEnd",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: fund.raise as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "managementFeeBps",
      blockNumber,
    }) as Promise<number>,
    readContractWithRetry({
      address: fund.raise as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "performanceFeeBps",
      blockNumber,
    }) as Promise<number>,
    readContractWithRetry({
      address: fund.raise as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "fundDuration",
      blockNumber,
    }) as Promise<bigint>,
    readContractWithRetry({
      address: fund.raise as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "metadataURI",
      blockNumber,
    }) as Promise<string>,
  ]);

  const metadata = getCachedMetadata(metadataURI);

  return {
    vault: fund.vault,
    raise: fund.raise,
    manager: fund.manager,
    status: fund.status,
    totalDeposited: totalDeposited.toString(),
    vaultBalance: vaultBalance.toString(),
    minRaise: minRaise.toString(),
    maxRaise: maxRaise.toString(),
    depositStart: Number(depositStart),
    depositEnd: Number(depositEnd),
    managementFeeBps: Number(managementFeeBps),
    performanceFeeBps: Number(performanceFeeBps),
    fundDuration: fundDuration.toString(),
    metadataURI,
    metadata,
  };
}

/**
 * Get list of all known funds with basic stats.
 * Read-only resource: funds://list
 */
export async function getFundsList(): Promise<FundsListData> {
  const client = getPublicClient();
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });

  // Get all funds from database (includes cached immutable params if available)
  const dbFunds = getAllFunds();

  // Fetch on-chain data for each fund in parallel
  const fundPromises = dbFunds.map((fund) => {
    // Use cached path (2 RPC calls) if params are populated, otherwise fallback (10 RPC calls)
    if (fund.min_raise !== null) {
      return buildFromCache(fund, blockNumber);
    }
    return buildFromChain(fund, blockNumber);
  });

  const funds = await Promise.all(fundPromises);

  return { funds };
}
