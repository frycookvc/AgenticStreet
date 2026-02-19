import { getPublicClient, readContractWithRetry } from "../viem.js";
import { FundRaiseABI, ERC20ABI, USDC_ADDRESS } from "../config.js";
import { isAddress } from "viem";
import { getAllFunds, type FundStatus } from "../db.js";

export interface ManagedFundData {
  vault: string;
  raise: string;
  status: FundStatus;
  totalDeposited: string;
  vaultBalance: string;
}

export interface ManagedFundsData {
  address: string;
  managed: ManagedFundData[];
}

/**
 * Get funds managed by a specific address.
 * Read-only resource: funds://managed/{addr}
 */
export async function getManagedFunds(address: string): Promise<ManagedFundsData> {
  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  const client = getPublicClient();
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });

  // Get all funds and filter by manager
  const dbFunds = getAllFunds();
  const managedFunds = dbFunds.filter(
    (fund) => fund.manager.toLowerCase() === address.toLowerCase()
  );

  // Fetch on-chain data for each managed fund in parallel
  const fundPromises = managedFunds.map(async (fund) => {
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

    return {
      vault: fund.vault,
      raise: fund.raise,
      status: fund.status,
      totalDeposited: totalDeposited.toString(),
      vaultBalance: vaultBalance.toString(),
    };
  });

  const managed = await Promise.all(fundPromises);

  return {
    address,
    managed,
  };
}
