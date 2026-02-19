import { getPublicClient, readContractWithRetry } from "../viem.js";
import { FundRaiseABI } from "../config.js";
import { isAddress } from "viem";
import { getAllFunds, type FundStatus } from "../db.js";

export interface PositionData {
  vault: string;
  raise: string;
  shares: string;
  totalShares: string;
  ownershipPercent: number;
  status: FundStatus;
}

export interface PositionsData {
  address: string;
  positions: PositionData[];
}

/**
 * Get LP positions for an address across all known funds.
 * Read-only resource: funds://positions/{addr}
 */
export async function getPositions(address: string): Promise<PositionsData> {
  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  const client = getPublicClient();
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });

  // Get all known funds
  const dbFunds = getAllFunds();

  // Check share balance for each fund in parallel
  const positionPromises = dbFunds.map(async (fund) => {
    const [shareBalance, totalShares] = await Promise.all([
      readContractWithRetry({
        address: fund.raise as `0x${string}`,
        abi: FundRaiseABI,
        functionName: "shareBalance",
        args: [address],
        blockNumber,
      }) as Promise<bigint>,
      readContractWithRetry({
        address: fund.raise as `0x${string}`,
        abi: FundRaiseABI,
        functionName: "totalShares",
        blockNumber,
      }) as Promise<bigint>,
    ]);

    // Only return if balance > 0
    if (shareBalance === 0n) {
      return null;
    }

    // Calculate ownership percentage (2 decimal places)
    const ownershipPercent = totalShares > 0n
      ? Number((shareBalance * 10000n / totalShares)) / 100
      : 0;

    return {
      vault: fund.vault,
      raise: fund.raise,
      shares: shareBalance.toString(),
      totalShares: totalShares.toString(),
      ownershipPercent,
      status: fund.status,
    };
  });

  const allPositions = await Promise.all(positionPromises);

  // Filter out null values (funds with 0 balance)
  const positions = allPositions.filter((p): p is PositionData => p !== null);

  return {
    address,
    positions,
  };
}
