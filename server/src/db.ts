import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { getAddress, isAddress } from "viem";
import { DB_PATH } from "./config.js";
import { logger } from "./logger.js";

/**
 * Normalizes an address to checksum format if valid, otherwise returns as-is.
 * This allows test code to use placeholder addresses while production code
 * from viem (which returns checksummed addresses) remains consistent.
 */
export function normalizeAddress(addr: string): string {
  try {
    return isAddress(addr) ? getAddress(addr) : addr;
  } catch {
    return addr;
  }
}

// Type definitions
export type FundStatus = "raising" | "active" | "winding_down" | "frozen" | "cancelled";

export interface FundRecord {
  vault: string;
  raise: string;
  manager: string;
  created_at_block: number;
  status: FundStatus;
  // Immutable fund params (cached at indexer time, nullable until backfilled)
  min_raise: string | null;
  max_raise: string | null;
  deposit_start: number | null;
  deposit_end: number | null;
  management_fee_bps: number | null;
  performance_fee_bps: number | null;
  fund_duration: string | null;
  metadata_uri: string | null;
  // Activation params (cached when fund activates, nullable until backfilled)
  drawdown_interval_seconds: number | null;
  fund_start_time: number | null;
  initial_deposits: string | null;
}

export interface DecodedEvent {
  id: number;
  vault: string;
  event_name: string;
  block_number: number;
  timestamp: number;
  tx_hash: string;
  decoded: string;
}

export interface ApiKeyRecord {
  id: string;
  key_hash: string | null;
  encrypted_api_key: string | null;
  label: string | null;
  status: "unclaimed" | "active" | "revoked";
  agent_name: string | null;
  agent_description: string | null;
  wallet_address: string | null;
  claim_token: string | null;
  claim_token_expires_at: number | null;
  claim_code: string | null;
  claimed_by_wallet: string | null;
  claim_tweet_url: string | null;
  tweet_author_name: string | null;
  tweet_author_url: string | null;
  claimed_at: number | null;
  key_retrieved_at: number | null;
  created_at: number;
  rate_limit: number;
}

export interface WebhookRecord {
  id: string;
  vault: string;
  callback_url: string;
  api_key_id: string | null;
  created_at: number;
}

export interface WebhookDeliveryRecord {
  id: string;
  webhook_id: string;
  payload: string;
  status: "pending" | "delivered" | "failed" | "dead";
  attempts: number;
  next_retry_at: number;
  last_error: string | null;
  created_at: number;
}

// Database instance (initialized by initDb)
let db: Database.Database | null = null;

/**
 * Initializes the SQLite database with schema migrations.
 * Must be called before any query operations.
 */
export function initDb(): Database.Database {
  if (db) return db;

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");

  // Prevent SQLITE_BUSY errors — wait up to 5s instead of failing immediately
  db.pragma("busy_timeout = 5000");

  // Enforce foreign key constraints
  db.pragma("foreign_keys = ON");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS funds (
      vault TEXT PRIMARY KEY,
      raise TEXT NOT NULL,
      manager TEXT NOT NULL,
      created_at_block INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'raising'
        CHECK (status IN ('raising', 'active', 'winding_down', 'frozen', 'cancelled'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vault TEXT NOT NULL,
      event_name TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      decoded TEXT NOT NULL,
      FOREIGN KEY (vault) REFERENCES funds(vault)
    );
    CREATE INDEX IF NOT EXISTS idx_events_vault ON events(vault, block_number DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique ON events(vault, tx_hash, event_name, block_number);

    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT UNIQUE,
      encrypted_api_key TEXT,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'unclaimed'
        CHECK (status IN ('unclaimed', 'active', 'revoked')),
      agent_name TEXT,
      agent_description TEXT,
      wallet_address TEXT,
      claim_token TEXT UNIQUE,
      claim_token_expires_at INTEGER,
      claim_code TEXT,
      claimed_by_wallet TEXT,
      claim_tweet_url TEXT,
      claimed_at INTEGER,
      key_retrieved_at INTEGER,
      created_at INTEGER NOT NULL,
      rate_limit INTEGER NOT NULL DEFAULT 60
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      vault TEXT NOT NULL,
      callback_url TEXT NOT NULL,
      api_key_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (vault) REFERENCES funds(vault)
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'delivered', 'failed', 'dead')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at INTEGER NOT NULL,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (webhook_id) REFERENCES webhooks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON webhook_deliveries(status, next_retry_at);

    CREATE TABLE IF NOT EXISTS metadata_cache (
      uri TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vault TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      line1 TEXT NOT NULL,
      line2 TEXT,
      FOREIGN KEY (vault) REFERENCES funds(vault)
    );
    CREATE INDEX IF NOT EXISTS idx_activity_vault ON activity_lines(vault, block_number DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_unique ON activity_lines(vault, block_number, line1);

    CREATE TABLE IF NOT EXISTS vault_participants (
      vault TEXT NOT NULL,
      wallet TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'depositor',
      PRIMARY KEY (vault, wallet)
    );
    CREATE INDEX IF NOT EXISTS idx_vp_wallet ON vault_participants(wallet);
  `);

  // Migration: Check if api_keys table needs migration from old schema
  const tableInfo = db.prepare("PRAGMA table_info(api_keys)").all() as Array<{
    name: string;
    type: string;
  }>;
  const hasStatusColumn = tableInfo.some((col) => col.name === "status");

  if (!hasStatusColumn) {
    // Migrate from old schema (revoked column) to new schema (status column)
    logger.info({ event: "db_migration_start", migration: "api_keys_new_schema" });
    db.exec(`
      ALTER TABLE api_keys ADD COLUMN status TEXT NOT NULL DEFAULT 'unclaimed'
        CHECK (status IN ('unclaimed', 'active', 'revoked'));
      ALTER TABLE api_keys ADD COLUMN encrypted_api_key TEXT;
      ALTER TABLE api_keys ADD COLUMN agent_name TEXT;
      ALTER TABLE api_keys ADD COLUMN agent_description TEXT;
      ALTER TABLE api_keys ADD COLUMN wallet_address TEXT;
      ALTER TABLE api_keys ADD COLUMN claim_token TEXT UNIQUE;
      ALTER TABLE api_keys ADD COLUMN claim_token_expires_at INTEGER;
      ALTER TABLE api_keys ADD COLUMN claim_code TEXT;
      ALTER TABLE api_keys ADD COLUMN claimed_by_wallet TEXT;
      ALTER TABLE api_keys ADD COLUMN claim_tweet_url TEXT;
      ALTER TABLE api_keys ADD COLUMN claimed_at INTEGER;
      ALTER TABLE api_keys ADD COLUMN key_retrieved_at INTEGER;

      UPDATE api_keys SET status = CASE WHEN revoked = 1 THEN 'revoked' ELSE 'active' END;
    `);
    logger.info({ event: "db_migration_complete", migration: "api_keys_new_schema" });
  }

  // Migration: X post verification columns (safe to re-run — catch handles "already exists")
  try {
    db.exec(`ALTER TABLE api_keys ADD COLUMN tweet_author_name TEXT;`);
  } catch {
    // Column already exists — expected on subsequent startups
  }
  try {
    db.exec(`ALTER TABLE api_keys ADD COLUMN tweet_author_url TEXT;`);
  } catch {
    // Column already exists — expected on subsequent startups
  }

  // Migration: Notification ack tracking
  try {
    db.exec("ALTER TABLE api_keys ADD COLUMN last_ack_event_id INTEGER DEFAULT 0;");
  } catch {
    // Column already exists — expected on subsequent startups
  }

  // Migration: Immutable fund params cache columns
  const fundParamCols = [
    "min_raise TEXT",
    "max_raise TEXT",
    "deposit_start INTEGER",
    "deposit_end INTEGER",
    "management_fee_bps INTEGER",
    "performance_fee_bps INTEGER",
    "fund_duration TEXT",
    "metadata_uri TEXT",
  ];
  for (const col of fundParamCols) {
    try {
      db.exec(`ALTER TABLE funds ADD COLUMN ${col};`);
    } catch {
      // Column already exists — expected on subsequent startups
    }
  }

  // Migration: Activation params cache columns (immutable once fund activates)
  const activationParamCols = [
    "drawdown_interval_seconds INTEGER",
    "fund_start_time INTEGER",
    "initial_deposits TEXT",
  ];
  for (const col of activationParamCols) {
    try {
      db.exec(`ALTER TABLE funds ADD COLUMN ${col};`);
    } catch {
      // Column already exists — expected on subsequent startups
    }
  }

  // Backfill vault_participants from existing data (idempotent via INSERT OR IGNORE)
  db.exec(`
    INSERT OR IGNORE INTO vault_participants (vault, wallet, role)
    SELECT vault, manager, 'manager' FROM funds;

    INSERT OR IGNORE INTO vault_participants (vault, wallet, role)
    SELECT DISTINCT vault, json_extract(decoded, '$.depositor'), 'depositor'
    FROM events WHERE event_name = 'Deposit';
  `);

  // Create backups directory alongside the database
  fs.mkdirSync(path.join(path.dirname(DB_PATH), "backups"), { recursive: true });

  logger.info({ event: "db_initialized", path: DB_PATH });
  return db;
}

/**
 * Returns the database instance. Must call initDb() first.
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

/**
 * Closes and resets the database instance.
 * Used for testing to ensure clean state between tests.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    stmts = {};
  }
}

// Prepared statement cache
let stmts: {
  getLastIndexedBlock?: Database.Statement;
  setLastIndexedBlock?: Database.Statement;
  insertFund?: Database.Statement;
  insertEvent?: Database.Statement;
  getFundByVault?: Database.Statement;
  getAllFunds?: Database.Statement;
  getEventsByVault?: Database.Statement;
  updateFundStatus?: Database.Statement;
  getApiKeyByHash?: Database.Statement;
  insertApiKey?: Database.Statement;
  getAllApiKeys?: Database.Statement;
  revokeApiKey?: Database.Statement;
  insertWebhook?: Database.Statement;
  deleteWebhook?: Database.Statement;
  getWebhooksByVault?: Database.Statement;
  getPendingDeliveries?: Database.Statement;
  updateDeliveryStatus?: Database.Statement;
  deleteDeliveriesByWebhook?: Database.Statement;
  insertRegistration?: Database.Statement;
  getApiKeyByClaimToken?: Database.Statement;
  getApiKeyById?: Database.Statement;
  updateApiKeyClaim?: Database.Statement;
  updateApiKeyRetrieved?: Database.Statement;
  getActiveKeyByWallet?: Database.Statement;
  getPendingClaims?: Database.Statement;
  getMetadataCacheByUri?: Database.Statement;
  upsertMetadataCache?: Database.Statement;
  getAllMetadataCache?: Database.Statement;
  updateFundParams?: Database.Statement;
  getFundsWithoutParams?: Database.Statement;
  updateFundActivationParams?: Database.Statement;
  getFundsWithoutActivationParams?: Database.Statement;
  getTotalDepositedFromEvents?: Database.Statement;
  getLatestCumulativeDrawn?: Database.Statement;
  getTotalManagementFees?: Database.Statement;
  getDepositorCount?: Database.Statement;
  insertActivityLine?: Database.Statement;
  getActivityByVault?: Database.Statement;
  updateApiKeyWallet?: Database.Statement;
  insertVaultParticipant?: Database.Statement;
} = {};

/**
 * Initializes prepared statements after db is ready.
 */
function ensureStmts() {
  const database = getDb();

  if (!stmts.getLastIndexedBlock) {
    stmts.getLastIndexedBlock = database.prepare(
      "SELECT value FROM indexer_state WHERE key = 'last_indexed_block'"
    );
  }

  if (!stmts.setLastIndexedBlock) {
    stmts.setLastIndexedBlock = database.prepare(
      "INSERT OR REPLACE INTO indexer_state (key, value) VALUES ('last_indexed_block', ?)"
    );
  }

  if (!stmts.insertFund) {
    stmts.insertFund = database.prepare(
      "INSERT OR IGNORE INTO funds (vault, raise, manager, created_at_block, status) VALUES (?, ?, ?, ?, ?)"
    );
  }

  if (!stmts.insertEvent) {
    stmts.insertEvent = database.prepare(
      "INSERT OR IGNORE INTO events (vault, event_name, block_number, timestamp, tx_hash, decoded) VALUES (?, ?, ?, ?, ?, ?)"
    );
  }

  if (!stmts.getFundByVault) {
    stmts.getFundByVault = database.prepare(
      "SELECT * FROM funds WHERE vault = ?"
    );
  }

  if (!stmts.getAllFunds) {
    stmts.getAllFunds = database.prepare(
      "SELECT * FROM funds ORDER BY created_at_block DESC"
    );
  }

  if (!stmts.getEventsByVault) {
    stmts.getEventsByVault = database.prepare(
      "SELECT * FROM events WHERE vault = ? ORDER BY block_number DESC"
    );
  }

  if (!stmts.updateFundStatus) {
    stmts.updateFundStatus = database.prepare(
      "UPDATE funds SET status = ? WHERE vault = ?"
    );
  }

  if (!stmts.getApiKeyByHash) {
    stmts.getApiKeyByHash = database.prepare(
      "SELECT * FROM api_keys WHERE key_hash = ?"
    );
  }

  if (!stmts.insertApiKey) {
    stmts.insertApiKey = database.prepare(
      "INSERT INTO api_keys (id, key_hash, label, created_at, rate_limit, status) VALUES (?, ?, ?, ?, ?, ?)"
    );
  }

  if (!stmts.getAllApiKeys) {
    stmts.getAllApiKeys = database.prepare(
      "SELECT * FROM api_keys ORDER BY created_at DESC"
    );
  }

  if (!stmts.revokeApiKey) {
    stmts.revokeApiKey = database.prepare(
      "UPDATE api_keys SET status = 'revoked' WHERE id = ?"
    );
  }

  if (!stmts.insertWebhook) {
    stmts.insertWebhook = database.prepare(
      "INSERT INTO webhooks (id, vault, callback_url, api_key_id, created_at) VALUES (?, ?, ?, ?, ?)"
    );
  }

  if (!stmts.deleteWebhook) {
    stmts.deleteWebhook = database.prepare(
      "DELETE FROM webhooks WHERE id = ?"
    );
  }

  if (!stmts.getWebhooksByVault) {
    stmts.getWebhooksByVault = database.prepare(
      "SELECT * FROM webhooks WHERE vault = ?"
    );
  }

  if (!stmts.getPendingDeliveries) {
    stmts.getPendingDeliveries = database.prepare(`
      SELECT
        d.*,
        w.callback_url
      FROM webhook_deliveries d
      JOIN webhooks w ON d.webhook_id = w.id
      WHERE d.status = 'pending' AND d.next_retry_at <= ?
      ORDER BY d.created_at
    `);
  }

  if (!stmts.updateDeliveryStatus) {
    stmts.updateDeliveryStatus = database.prepare(
      "UPDATE webhook_deliveries SET status = ?, attempts = attempts + 1, last_error = ?, next_retry_at = ? WHERE id = ?"
    );
  }

  if (!stmts.deleteDeliveriesByWebhook) {
    stmts.deleteDeliveriesByWebhook = database.prepare(
      "DELETE FROM webhook_deliveries WHERE webhook_id = ?"
    );
  }

  if (!stmts.insertRegistration) {
    stmts.insertRegistration = database.prepare(`
      INSERT INTO api_keys (
        id, claim_token, claim_code, status, claim_token_expires_at,
        agent_name, agent_description, wallet_address, created_at, rate_limit
      ) VALUES (?, ?, ?, 'unclaimed', ?, ?, ?, ?, ?, ?)
    `);
  }

  if (!stmts.getApiKeyByClaimToken) {
    stmts.getApiKeyByClaimToken = database.prepare(
      "SELECT * FROM api_keys WHERE claim_token = ?"
    );
  }

  if (!stmts.getApiKeyById) {
    stmts.getApiKeyById = database.prepare(
      "SELECT * FROM api_keys WHERE id = ?"
    );
  }

  if (!stmts.updateApiKeyClaim) {
    stmts.updateApiKeyClaim = database.prepare(`
      UPDATE api_keys
      SET status = 'active', key_hash = ?, encrypted_api_key = ?,
          claimed_at = ?, claim_tweet_url = ?, claimed_by_wallet = ?,
          tweet_author_name = ?, tweet_author_url = ?,
          claim_token_expires_at = 0
      WHERE id = ?
    `);
  }

  if (!stmts.updateApiKeyRetrieved) {
    stmts.updateApiKeyRetrieved = database.prepare(`
      UPDATE api_keys
      SET encrypted_api_key = NULL, key_retrieved_at = ?
      WHERE id = ?
    `);
  }

  if (!stmts.getActiveKeyByWallet) {
    stmts.getActiveKeyByWallet = database.prepare(
      "SELECT * FROM api_keys WHERE wallet_address = ? AND status = 'active'"
    );
  }

  if (!stmts.getPendingClaims) {
    stmts.getPendingClaims = database.prepare(`
      SELECT id, agent_name, agent_description, claim_code, claim_tweet_url,
             tweet_author_name, tweet_author_url,
             claimed_by_wallet, claimed_at, created_at
      FROM api_keys
      WHERE status = 'active' AND claim_tweet_url IS NOT NULL
      ORDER BY claimed_at DESC
      LIMIT 50
    `);
  }

  if (!stmts.getMetadataCacheByUri) {
    stmts.getMetadataCacheByUri = database.prepare(
      "SELECT json FROM metadata_cache WHERE uri = ?"
    );
  }

  if (!stmts.upsertMetadataCache) {
    stmts.upsertMetadataCache = database.prepare(
      "INSERT OR REPLACE INTO metadata_cache (uri, json, fetched_at) VALUES (?, ?, ?)"
    );
  }

  if (!stmts.getAllMetadataCache) {
    stmts.getAllMetadataCache = database.prepare(
      "SELECT uri, json FROM metadata_cache"
    );
  }

  if (!stmts.updateFundParams) {
    stmts.updateFundParams = database.prepare(`
      UPDATE funds SET
        min_raise = ?, max_raise = ?, deposit_start = ?, deposit_end = ?,
        management_fee_bps = ?, performance_fee_bps = ?, fund_duration = ?, metadata_uri = ?
      WHERE vault = ?
    `);
  }

  if (!stmts.getFundsWithoutParams) {
    stmts.getFundsWithoutParams = database.prepare(
      "SELECT * FROM funds WHERE min_raise IS NULL ORDER BY created_at_block DESC"
    );
  }

  if (!stmts.updateFundActivationParams) {
    stmts.updateFundActivationParams = database.prepare(`
      UPDATE funds SET
        drawdown_interval_seconds = ?, fund_start_time = ?, initial_deposits = ?
      WHERE vault = ?
    `);
  }

  if (!stmts.getFundsWithoutActivationParams) {
    stmts.getFundsWithoutActivationParams = database.prepare(
      "SELECT * FROM funds WHERE status NOT IN ('raising', 'cancelled') AND initial_deposits IS NULL ORDER BY created_at_block DESC"
    );
  }

  if (!stmts.getTotalDepositedFromEvents) {
    stmts.getTotalDepositedFromEvents = database.prepare(`
      SELECT
        COALESCE((SELECT SUM(CAST(json_extract(decoded, '$.amount') AS INTEGER)) FROM events WHERE vault = ? AND event_name = 'Deposit'), 0)
        -
        COALESCE((SELECT SUM(CAST(json_extract(decoded, '$.amount') AS INTEGER)) FROM events WHERE vault = ? AND event_name = 'Refund'), 0)
        AS total
    `);
  }

  if (!stmts.getLatestCumulativeDrawn) {
    stmts.getLatestCumulativeDrawn = database.prepare(`
      SELECT json_extract(decoded, '$.newCumulativeDrawn') as value
      FROM events
      WHERE vault = ? AND event_name = 'DrawdownUpdated'
      ORDER BY block_number DESC
      LIMIT 1
    `);
  }

  if (!stmts.getTotalManagementFees) {
    stmts.getTotalManagementFees = database.prepare(`
      SELECT COALESCE(SUM(CAST(json_extract(decoded, '$.fee') AS INTEGER)), 0) as total
      FROM events
      WHERE vault = ? AND event_name = 'ManagementFeeClaimed'
    `);
  }

  if (!stmts.getDepositorCount) {
    stmts.getDepositorCount = database.prepare(`
      SELECT COUNT(DISTINCT json_extract(decoded, '$.depositor')) as count
      FROM events
      WHERE vault = ? AND event_name = 'Deposit'
    `);
  }

  if (!stmts.insertActivityLine) {
    stmts.insertActivityLine = database.prepare(
      "INSERT OR IGNORE INTO activity_lines (vault, block_number, timestamp, line1, line2) VALUES (?, ?, ?, ?, ?)"
    );
  }

  if (!stmts.updateApiKeyWallet) {
    stmts.updateApiKeyWallet = database.prepare(
      "UPDATE api_keys SET wallet_address = ? WHERE id = ? AND status = 'active'"
    );
  }

  if (!stmts.insertVaultParticipant) {
    stmts.insertVaultParticipant = database.prepare(
      "INSERT OR IGNORE INTO vault_participants (vault, wallet, role) VALUES (?, ?, ?)"
    );
  }

  if (!stmts.getActivityByVault) {
    stmts.getActivityByVault = database.prepare(
      "SELECT * FROM activity_lines WHERE vault = ? ORDER BY block_number DESC LIMIT ?"
    );
  }
}

// Query helper functions

export function getLastIndexedBlock(): bigint | null {
  ensureStmts();
  const row = stmts.getLastIndexedBlock!.get() as { value: string } | undefined;
  return row ? BigInt(row.value) : null;
}

export function setLastIndexedBlock(block: bigint): void {
  ensureStmts();
  stmts.setLastIndexedBlock!.run(block.toString());
}

export function insertFund(fund: {
  vault: string;
  raise: string;
  manager: string;
  created_at_block: number;
  status: FundStatus;
}): void {
  ensureStmts();
  stmts.insertFund!.run(
    normalizeAddress(fund.vault),
    normalizeAddress(fund.raise),
    normalizeAddress(fund.manager),
    fund.created_at_block,
    fund.status
  );
}

export function insertEvent(event: {
  vault: string;
  event_name: string;
  block_number: number;
  timestamp: number;
  tx_hash: string;
  decoded: string;
}): number {
  ensureStmts();
  const result = stmts.insertEvent!.run(
    normalizeAddress(event.vault),
    event.event_name,
    event.block_number,
    event.timestamp,
    event.tx_hash,
    event.decoded
  );
  return Number(result.lastInsertRowid);
}

export function getFundByVault(vault: string): FundRecord | null {
  ensureStmts();
  const row = stmts.getFundByVault!.get(normalizeAddress(vault)) as FundRecord | undefined;
  return row ?? null;
}

export function getAllFunds(): FundRecord[] {
  ensureStmts();
  return stmts.getAllFunds!.all() as FundRecord[];
}

export function getEventsByVault(vault: string): DecodedEvent[] {
  ensureStmts();
  return stmts.getEventsByVault!.all(normalizeAddress(vault)) as DecodedEvent[];
}

export function updateFundStatus(vault: string, status: FundStatus): void {
  ensureStmts();
  stmts.updateFundStatus!.run(status, normalizeAddress(vault));
}

export function getApiKeyByHash(hash: string): ApiKeyRecord | null {
  ensureStmts();
  const row = stmts.getApiKeyByHash!.get(hash) as ApiKeyRecord | undefined;
  return row ?? null;
}

// API key helpers
export function insertApiKey(key: {
  id: string;
  key_hash: string;
  label: string;
  created_at: number;
  rate_limit: number;
}): void {
  ensureStmts();
  stmts.insertApiKey!.run(
    key.id,
    key.key_hash,
    key.label,
    key.created_at,
    key.rate_limit,
    "active"
  );
}

export function getAllApiKeys(): ApiKeyRecord[] {
  ensureStmts();
  return stmts.getAllApiKeys!.all() as ApiKeyRecord[];
}

export function revokeApiKey(id: string): boolean {
  ensureStmts();
  const result = stmts.revokeApiKey!.run(id);
  return result.changes > 0;
}

// Webhook helpers
export function insertWebhook(webhook: {
  id: string;
  vault: string;
  callback_url: string;
  api_key_id: string | null;
  created_at: number;
}): void {
  ensureStmts();
  stmts.insertWebhook!.run(
    webhook.id,
    normalizeAddress(webhook.vault),
    webhook.callback_url,
    webhook.api_key_id,
    webhook.created_at
  );
}

export function deleteWebhook(id: string): void {
  ensureStmts();
  stmts.deleteWebhook!.run(id);
}

export function getWebhooksByVault(vault: string): WebhookRecord[] {
  ensureStmts();
  return stmts.getWebhooksByVault!.all(normalizeAddress(vault)) as WebhookRecord[];
}

// Webhook delivery helpers
export function getPendingDeliveries(
  now: number
): Array<WebhookDeliveryRecord & { callback_url: string }> {
  ensureStmts();
  return stmts.getPendingDeliveries!.all(now) as Array<
    WebhookDeliveryRecord & { callback_url: string }
  >;
}

export function updateDeliveryStatus(
  id: string,
  status: string,
  lastError?: string | null,
  nextRetryAt?: number | null
): void {
  ensureStmts();
  stmts.updateDeliveryStatus!.run(
    status,
    lastError !== undefined ? lastError : null,
    nextRetryAt !== undefined ? nextRetryAt : null,
    id
  );
}

export function deleteDeliveriesByWebhook(webhookId: string): void {
  ensureStmts();
  stmts.deleteDeliveriesByWebhook!.run(webhookId);
}

// Registration helpers
export function insertRegistration(data: {
  id: string;
  claim_token: string;
  claim_code: string;
  claim_token_expires_at: number;
  agent_name: string;
  agent_description: string;
  wallet_address: string | null;
  created_at: number;
  rate_limit: number;
}): void {
  ensureStmts();
  stmts.insertRegistration!.run(
    data.id,
    data.claim_token,
    data.claim_code,
    data.claim_token_expires_at,
    data.agent_name,
    data.agent_description,
    data.wallet_address,
    data.created_at,
    data.rate_limit
  );
}

export function getApiKeyByClaimToken(token: string): ApiKeyRecord | null {
  ensureStmts();
  const row = stmts.getApiKeyByClaimToken!.get(token) as ApiKeyRecord | undefined;
  return row ?? null;
}

export function getApiKeyById(id: string): ApiKeyRecord | null {
  ensureStmts();
  const row = stmts.getApiKeyById!.get(id) as ApiKeyRecord | undefined;
  return row ?? null;
}

export function updateApiKeyClaim(data: {
  id: string;
  key_hash: string;
  encrypted_api_key: string;
  claimed_at: number;
  claim_tweet_url: string;
  claimed_by_wallet: string | null;
  tweet_author_name: string | null;
  tweet_author_url: string | null;
}): void {
  ensureStmts();
  stmts.updateApiKeyClaim!.run(
    data.key_hash,
    data.encrypted_api_key,
    data.claimed_at,
    data.claim_tweet_url,
    data.claimed_by_wallet,
    data.tweet_author_name,
    data.tweet_author_url,
    data.id
  );
}

export function updateApiKeyRetrieved(id: string, retrieved_at: number): void {
  ensureStmts();
  stmts.updateApiKeyRetrieved!.run(retrieved_at, id);
}

export function getActiveKeyByWallet(wallet: string): ApiKeyRecord | null {
  ensureStmts();
  const row = stmts.getActiveKeyByWallet!.get(normalizeAddress(wallet)) as ApiKeyRecord | undefined;
  return row ?? null;
}

export function getPendingClaims(): Array<{
  id: string;
  agent_name: string | null;
  agent_description: string | null;
  claim_code: string | null;
  claim_tweet_url: string | null;
  tweet_author_name: string | null;
  tweet_author_url: string | null;
  claimed_by_wallet: string | null;
  claimed_at: number | null;
  created_at: number;
}> {
  ensureStmts();
  return stmts.getPendingClaims!.all() as Array<{
    id: string;
    agent_name: string | null;
    agent_description: string | null;
    claim_code: string | null;
    claim_tweet_url: string | null;
    tweet_author_name: string | null;
    tweet_author_url: string | null;
    claimed_by_wallet: string | null;
    claimed_at: number | null;
    created_at: number;
  }>;
}

// Metadata cache helpers

export function getMetadataFromDb(uri: string): string | null {
  ensureStmts();
  const row = stmts.getMetadataCacheByUri!.get(uri) as { json: string } | undefined;
  return row?.json ?? null;
}

export function upsertMetadataToDb(uri: string, json: string): void {
  ensureStmts();
  stmts.upsertMetadataCache!.run(uri, json, Date.now());
}

export function getAllMetadataFromDb(): Array<{ uri: string; json: string }> {
  ensureStmts();
  return stmts.getAllMetadataCache!.all() as Array<{ uri: string; json: string }>;
}

// Fund params cache helpers

export interface FundParams {
  min_raise: string;
  max_raise: string;
  deposit_start: number;
  deposit_end: number;
  management_fee_bps: number;
  performance_fee_bps: number;
  fund_duration: string;
  metadata_uri: string;
}

export function updateFundParamsDb(vault: string, params: FundParams): void {
  ensureStmts();
  stmts.updateFundParams!.run(
    params.min_raise,
    params.max_raise,
    params.deposit_start,
    params.deposit_end,
    params.management_fee_bps,
    params.performance_fee_bps,
    params.fund_duration,
    params.metadata_uri,
    normalizeAddress(vault)
  );
}

export function getFundsWithoutParams(): FundRecord[] {
  ensureStmts();
  return stmts.getFundsWithoutParams!.all() as FundRecord[];
}

// Activation params cache helpers

export interface ActivationParams {
  drawdown_interval_seconds: number;
  fund_start_time: number;
  initial_deposits: string;
}

export function updateFundActivationParamsDb(vault: string, params: ActivationParams): void {
  ensureStmts();
  stmts.updateFundActivationParams!.run(
    params.drawdown_interval_seconds,
    params.fund_start_time,
    params.initial_deposits,
    normalizeAddress(vault)
  );
}

export function getFundsWithoutActivationParams(): FundRecord[] {
  ensureStmts();
  return stmts.getFundsWithoutActivationParams!.all() as FundRecord[];
}

// Event aggregation helpers (used by optimized fund stats)

export function getTotalDepositedFromEvents(vault: string): string {
  ensureStmts();
  const normalized = normalizeAddress(vault);
  const row = stmts.getTotalDepositedFromEvents!.get(normalized, normalized) as { total: number } | undefined;
  return String(row?.total ?? 0);
}

export function getLatestCumulativeDrawn(vault: string): string {
  ensureStmts();
  const row = stmts.getLatestCumulativeDrawn!.get(normalizeAddress(vault)) as { value: string } | undefined;
  return row?.value ?? "0";
}

export function getTotalManagementFees(vault: string): string {
  ensureStmts();
  const row = stmts.getTotalManagementFees!.get(normalizeAddress(vault)) as { total: number } | undefined;
  return String(row?.total ?? 0);
}

export function getDepositorCount(vault: string): number {
  ensureStmts();
  const row = stmts.getDepositorCount!.get(normalizeAddress(vault)) as { count: number } | undefined;
  return row?.count ?? 0;
}

// Activity lines helpers

export interface ActivityLineRecord {
  id: number;
  vault: string;
  block_number: number;
  timestamp: number;
  line1: string;
  line2: string | null;
}

export function insertActivityLine(
  vault: string,
  block_number: number,
  timestamp: number,
  line1: string,
  line2?: string | null,
): void {
  ensureStmts();
  stmts.insertActivityLine!.run(
    normalizeAddress(vault),
    block_number,
    timestamp,
    line1,
    line2 ?? null,
  );
}

export function updateApiKeyWallet(id: string, wallet: string): boolean {
  ensureStmts();
  const result = stmts.updateApiKeyWallet!.run(normalizeAddress(wallet), id);
  return result.changes > 0;
}

export function getActivityByVault(vault: string, limit = 50): ActivityLineRecord[] {
  ensureStmts();
  return stmts.getActivityByVault!.all(normalizeAddress(vault), limit) as ActivityLineRecord[];
}

export function insertVaultParticipant(vault: string, wallet: string, role: "manager" | "depositor"): void {
  ensureStmts();
  stmts.insertVaultParticipant!.run(normalizeAddress(vault), normalizeAddress(wallet), role);
}
