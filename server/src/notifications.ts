import { getDb, getFundByVault } from "./db.js";
import { resolveVaults, PUSHED } from "./sseManager.js";

export { resolveVaults, PUSHED };

interface PendingOptions {
  vaults: Set<string>;
  since: number;
  ackFloor: number;
  limit?: number;
}

export interface NotificationEvent {
  id: number;
  event: string;
  vault: string;
  timestamp: number;
  data: Record<string, unknown>;
  txHash?: string;
}

export function getPendingEvents(opts: PendingOptions): NotificationEvent[] {
  if (opts.vaults.size === 0) return [];
  const db = getDb();
  const vList = [...opts.vaults];
  const eList = [...PUSHED];
  const vPh = vList.map(() => "?").join(",");
  const ePh = eList.map(() => "?").join(",");
  const limit = opts.limit ?? 50;

  const rows = db.prepare(`
    SELECT id, event_name, vault, decoded, timestamp
    FROM events
    WHERE id > ? AND timestamp > ? AND vault IN (${vPh}) AND event_name IN (${ePh})
    ORDER BY id ASC LIMIT ?
  `).all(opts.ackFloor, opts.since, ...vList, ...eList, limit);

  const mapped = (rows as any[]).map((r) => ({
    id: r.id,
    event: r.event_name,
    vault: r.vault,
    timestamp: r.timestamp,
    data: JSON.parse(r.decoded),
  }));

  return mapped.filter((row) => {
    if (row.event === "FundFinalised") {
      const fund = getFundByVault(row.vault);
      if (fund && fund.status !== "raising") return false;
    }
    return true;
  });
}

export function getCatchUpEvents(opts: { vaults: Set<string>; since: number; limit?: number }): NotificationEvent[] {
  if (opts.vaults.size === 0) return [];
  const db = getDb();
  const vList = [...opts.vaults];
  const eList = [...PUSHED];
  const vPh = vList.map(() => "?").join(",");
  const ePh = eList.map(() => "?").join(",");
  const limit = Math.min(opts.limit ?? 50, 200);

  const rows = db.prepare(`
    SELECT id, event_name, vault, decoded, timestamp, tx_hash
    FROM events
    WHERE timestamp > ? AND vault IN (${vPh}) AND event_name IN (${ePh})
    ORDER BY id DESC LIMIT ?
  `).all(opts.since, ...vList, ...eList, limit);

  return (rows as any[]).map((r) => ({
    id: r.id,
    event: r.event_name,
    vault: r.vault,
    timestamp: r.timestamp,
    data: JSON.parse(r.decoded),
    txHash: r.tx_hash,
  }));
}

export function getAckFloor(apiKeyId: string): number {
  const row = getDb().prepare(
    "SELECT last_ack_event_id FROM api_keys WHERE id = ?"
  ).get(apiKeyId) as any;
  return row?.last_ack_event_id ?? 0;
}

export function setAckFloor(apiKeyId: string, eventId: number): void {
  getDb().prepare(
    "UPDATE api_keys SET last_ack_event_id = MAX(last_ack_event_id, ?) WHERE id = ?"
  ).run(eventId, apiKeyId);
}
