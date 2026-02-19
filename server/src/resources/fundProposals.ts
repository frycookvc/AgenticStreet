import { getPublicClient, readContractWithRetry } from "../viem.js";
import { FundVaultABI, FundRaiseABI } from "../config.js";
import { isAddress } from "viem";
import { decodeAdapterCall } from "../adapterCodec.js";
import { formatCountdown } from "./utils.js";

export interface ProposalData {
  id: number;
  type: "adapter" | "raw_call";
  target: string;
  // Adapter-specific
  adapterName?: string;
  action?: string;
  params?: Record<string, unknown>;
  // Raw-call-specific
  selector?: string;
  calldata?: string;
  // Common
  functionName: string;
  value: string;
  proposedAt: number;
  executableAt: number;
  vetoPercent: number;
  vetoShares: string;
  totalShares: string;
  status: string;
  countdown: string;
}

export interface FundProposalsData {
  proposals: ProposalData[];
}

/**
 * Get active proposals for a fund from on-chain state.
 * Read-only resource: fund://{vault}/proposals
 */
export async function getFundProposals(vaultAddress: string): Promise<FundProposalsData> {
  if (!isAddress(vaultAddress)) {
    throw new Error(`Invalid vault address: ${vaultAddress}`);
  }

  const client = getPublicClient();
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });

  const proposalCount = await readContractWithRetry({
    address: vaultAddress as `0x${string}`,
    abi: FundVaultABI,
    functionName: "proposalCount",
    blockNumber,
  }) as bigint;

  const raiseAddress = await readContractWithRetry({
    address: vaultAddress as `0x${string}`,
    abi: FundVaultABI,
    functionName: "raiseContract",
    blockNumber,
  }) as string;

  const totalShares = await readContractWithRetry({
    address: raiseAddress as `0x${string}`,
    abi: FundRaiseABI,
    functionName: "totalShares",
    blockNumber,
  }) as bigint;

  const now = Math.floor(Date.now() / 1000);
  const proposals: ProposalData[] = [];

  for (let i = 0; i < Number(proposalCount); i++) {
    const proposalData = await readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "proposals",
      args: [BigInt(i)],
      blockNumber,
    }) as [string, string, bigint, bigint, bigint, boolean, boolean];

    const [target, calldata_, value, proposedAt, executableAt, executed, cancelled] = proposalData;

    if (executed || cancelled) {
      continue;
    }

    const vetoShares = await readContractWithRetry({
      address: vaultAddress as `0x${string}`,
      abi: FundVaultABI,
      functionName: "vetoSharesTotal",
      args: [BigInt(i)],
      blockNumber,
    }) as bigint;

    const vetoPercent = totalShares > 0n
      ? Number((vetoShares * 10000n / totalShares)) / 100
      : 0;

    const countdown = formatCountdown(Number(executableAt));
    const decoded = decodeAdapterCall(target, calldata_ as `0x${string}`);
    const isAdapter = decoded !== null;

    proposals.push({
      id: i,
      type: isAdapter ? "adapter" : "raw_call",
      target,
      ...(isAdapter && {
        adapterName: decoded.adapterName,
        action: decoded.action,
        params: decoded.params,
      }),
      ...(!isAdapter && {
        selector: calldata_.slice(0, 10),
        calldata: calldata_,
      }),
      functionName: isAdapter ? decoded.action : calldata_.slice(0, 10),
      value: value.toString(),
      proposedAt: Number(proposedAt),
      executableAt: Number(executableAt),
      vetoPercent,
      vetoShares: vetoShares.toString(),
      totalShares: totalShares.toString(),
      status: now < Number(executableAt) ? "pending" : "executable",
      countdown,
    });
  }

  return { proposals };
}
