import { isAddress } from "viem";
import { getEventsByVault } from "../db.js";

export interface FundFeedEvent {
  event: string;
  blockNumber: number;
  timestamp: number;
  txHash: string;
  decoded: Record<string, unknown>;
}

export interface FundFeedData {
  events: FundFeedEvent[];
}

/**
 * Get event feed for a fund from SQLite database.
 * Read-only resource: fund://{vault}/feed
 */
export async function getFundFeed(vaultAddress: string): Promise<FundFeedData> {
  if (!isAddress(vaultAddress)) {
    throw new Error(`Invalid vault address: ${vaultAddress}`);
  }

  // Get events from database (already sorted newest-first)
  const rawEvents = getEventsByVault(vaultAddress);

  // Parse decoded JSON strings
  const events: FundFeedEvent[] = rawEvents.map((event) => ({
    event: event.event_name,
    blockNumber: event.block_number,
    timestamp: event.timestamp,
    txHash: event.tx_hash,
    decoded: JSON.parse(event.decoded),
  }));

  return { events };
}
