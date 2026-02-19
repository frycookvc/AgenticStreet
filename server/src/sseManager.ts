import type { ServerResponse } from "node:http";
import { getDb, normalizeAddress } from "./db.js";
import { logger } from "./logger.js";
import {
  SSE_HEARTBEAT_MS,
  SSE_REPLAY_WINDOW_MS,
  SSE_MAX_PER_KEY,
} from "./config.js";

interface Connection {
  id: string;
  res: ServerResponse;
  apiKeyId: string;
  wallet: string;
  vaults: Set<string>;
}

const conns = new Map<string, Connection>();
let hbTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let counter = 0;

export const PUSHED = new Set([
  "ProposalCreated",
  "ProposalExecuted",
  "VetoCast",
  "ProposalVetoed",
  "FundWindDown",
  "FreezeVoteCast",
  "FundFrozenEvent",
  "Deposit",
  "FundFinalised",
]);

// ── Connection management ──

export function addConnection(
  res: ServerResponse,
  apiKeyId: string,
  wallet: string,
  vaults: Set<string>,
): string | null {
  let n = 0;
  for (const c of conns.values()) if (c.apiKeyId === apiKeyId) n++;
  if (n >= SSE_MAX_PER_KEY) return null;

  const id = `sse-${++counter}`;
  conns.set(id, { id, res, apiKeyId, wallet, vaults });
  res.on("close", () => conns.delete(id));
  logger.info({ event: "sse_connect", id, wallet, vaults: vaults.size });
  return id;
}

export function getStats() {
  return { connections: conns.size };
}

// ── Broadcast ──

export function broadcast(
  eventName: string,
  vault: string,
  eventId: number,
  payload: object,
) {
  if (!PUSHED.has(eventName)) return;
  const msg = fmtEvent(eventId, eventName, payload);
  const key = normalizeAddress(vault);
  for (const [id, c] of conns) {
    if (!c.vaults.has(key)) continue;
    if (!write(c, msg)) conns.delete(id);
  }
}

// ── Replay ──

export function replay(connectionId: string, afterId: number) {
  const c = conns.get(connectionId);
  if (!c || c.vaults.size === 0) return;

  const cutoff = Math.floor((Date.now() - SSE_REPLAY_WINDOW_MS) / 1000);
  const vList = [...c.vaults];
  const eList = [...PUSHED];
  const vPh = vList.map(() => "?").join(",");
  const ePh = eList.map(() => "?").join(",");

  const rows = getDb()
    .prepare(
      `SELECT id, event_name, vault, decoded, timestamp
    FROM events
    WHERE id > ? AND timestamp > ? AND vault IN (${vPh}) AND event_name IN (${ePh})
    ORDER BY id ASC LIMIT 200`,
    )
    .all(afterId, cutoff, ...vList, ...eList);

  for (const r of rows as any[]) {
    const msg = fmtEvent(r.id, r.event_name, {
      vault: r.vault,
      ...JSON.parse(r.decoded),
      timestamp: r.timestamp,
    });
    if (!write(c, msg)) {
      conns.delete(connectionId);
      return;
    }
  }
}

// ── Vault resolution ──

export function resolveVaults(wallet: string): Set<string> {
  const db = getDb();
  const addr = normalizeAddress(wallet);
  const rows = db.prepare(
    "SELECT vault FROM vault_participants WHERE wallet = ?"
  ).all(addr) as Array<{ vault: string }>;
  return new Set(rows.map(r => r.vault));
}

export function refreshWallet(wallet: string) {
  const addr = normalizeAddress(wallet);
  for (const c of conns.values()) {
    if (normalizeAddress(c.wallet) === addr) c.vaults = resolveVaults(c.wallet);
  }
}

// ── Timers ──

export function startTimers() {
  if (hbTimer) return;

  hbTimer = setInterval(() => {
    const msg = fmtHeartbeat();
    for (const [id, c] of conns) {
      if (!write(c, msg)) conns.delete(id);
    }
  }, SSE_HEARTBEAT_MS);

  refreshTimer = setInterval(() => {
    for (const c of conns.values()) c.vaults = resolveVaults(c.wallet);
  }, 60_000);
}

export function stopTimers() {
  if (hbTimer) {
    clearInterval(hbTimer);
    hbTimer = null;
  }
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// ── Internal ──

function fmtEvent(id: number, event: string, data: object): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function fmtHeartbeat(): string {
  return `event: heartbeat\ndata: {"ts":${Date.now()}}\n\n`;
}

function write(c: Connection, msg: string): boolean {
  try {
    c.res.write(msg);
    return true;
  } catch {
    return false;
  }
}
