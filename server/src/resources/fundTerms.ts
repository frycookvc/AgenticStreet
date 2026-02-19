import { readContractWithRetry } from "../viem.js";
import { FundVaultABI, FundRaiseABI, FundFactoryABI, FACTORY_ADDRESS } from "../config.js";
import { isAddress } from "viem";
import { getFundByVault } from "../db.js";
import { fetchMetadata, getCachedMetadata } from "./utils.js";

export interface FundTermsData {
  vault: string;
  raise: string;
  manager: string;
  minRaise: string;
  maxRaise: string;
  depositStart: number;
  depositEnd: number;
  managementFeeBps: number;
  performanceFeeBps: number;
  fundDuration: string;
  proposalDelay: string;
  metadataURI: string;
  metadata: object | null;
}

/**
 * Get fund terms from both FundRaise and FundVault contracts + IPFS metadata.
 * Uses cached immutable params from SQLite when available (1 RPC call instead of 11).
 * Read-only resource: fund://{vault}/terms
 */
export async function getFundTerms(vaultAddress: string): Promise<FundTermsData> {
  if (!isAddress(vaultAddress)) {
    throw new Error(`Invalid vault address: ${vaultAddress}`);
  }

  // Check if we have cached params in the database
  const dbFund = getFundByVault(vaultAddress);

  if (dbFund && dbFund.min_raise !== null) {
    // Fast path: only need proposalDelay from chain (1 RPC call)
    const proposalDelay = await readContractWithRetry({
      address: FACTORY_ADDRESS as `0x${string}`,
      abi: FundFactoryABI,
      functionName: "proposalDelay",
    }) as bigint;

    // Use cached metadata or fetch from IPFS
    const metadata = getCachedMetadata(dbFund.metadata_uri!) ?? await fetchMetadata(dbFund.metadata_uri!);

    return {
      vault: vaultAddress,
      raise: dbFund.raise,
      manager: dbFund.manager,
      minRaise: dbFund.min_raise!,
      maxRaise: dbFund.max_raise!,
      depositStart: dbFund.deposit_start!,
      depositEnd: dbFund.deposit_end!,
      managementFeeBps: dbFund.management_fee_bps!,
      performanceFeeBps: dbFund.performance_fee_bps!,
      fundDuration: dbFund.fund_duration!,
      proposalDelay: proposalDelay.toString(),
      metadataURI: dbFund.metadata_uri!,
      metadata,
    };
  }

  // Fallback: read everything from chain (11 RPC calls)
  const [manager, proposalDelay, raiseAddress] = await Promise.all([
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "manager",
    }) as Promise<string>,
    readContractWithRetry({
      address: FACTORY_ADDRESS as `0x${string}`,
      abi: FundFactoryABI,
      functionName: "proposalDelay",
    }) as Promise<bigint>,
    readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "raiseContract",
    }) as Promise<string>,
  ]);

  // Read from raise contract (fund parameters — fully populated at creation)
  const [minRaise, maxRaise, depositStart, depositEnd, managementFeeBps, performanceFeeBps, fundDuration, metadataURI] = await Promise.all([
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "minRaise",
    }) as Promise<bigint>,
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "maxRaise",
    }) as Promise<bigint>,
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "depositStart",
    }) as Promise<bigint>,
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "depositEnd",
    }) as Promise<bigint>,
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "managementFeeBps",
    }) as Promise<number>,
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "performanceFeeBps",
    }) as Promise<number>,
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "fundDuration",
    }) as Promise<bigint>,
    readContractWithRetry({
      address: raiseAddress as `0x${string}`,
      abi: FundRaiseABI,
      functionName: "metadataURI",
    }) as Promise<string>,
  ]);

  // Fetch IPFS metadata (cached, returns null on error)
  const metadata = await fetchMetadata(metadataURI);

  return {
    vault: vaultAddress,
    raise: raiseAddress,
    manager,
    minRaise: minRaise.toString(),
    maxRaise: maxRaise.toString(),
    depositStart: Number(depositStart),
    depositEnd: Number(depositEnd),
    managementFeeBps: Number(managementFeeBps),
    performanceFeeBps: Number(performanceFeeBps),
    fundDuration: fundDuration.toString(),
    proposalDelay: proposalDelay.toString(),
    metadataURI,
    metadata,
  };
}
