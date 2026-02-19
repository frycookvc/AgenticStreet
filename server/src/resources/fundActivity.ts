import { isAddress } from "viem";
import { getActivityByVault, type ActivityLineRecord } from "../db.js";

export interface ActivityLine {
  line1: string;
  line2: string | null;
  timestamp: number;
  blockNumber: number;
}

export interface FundActivityData {
  lines: ActivityLine[];
}

/**
 * Get pre-formatted activity log lines for a fund.
 * Pure SQLite read — 0 RPC calls.
 */
export async function getFundActivity(vaultAddress: string): Promise<FundActivityData> {
  if (!isAddress(vaultAddress)) {
    throw new Error(`Invalid vault address: ${vaultAddress}`);
  }

  const rows = getActivityByVault(vaultAddress, 50);

  const lines: ActivityLine[] = rows.map((r) => ({
    line1: r.line1,
    line2: r.line2,
    timestamp: r.timestamp,
    blockNumber: r.block_number,
  }));

  return { lines };
}
