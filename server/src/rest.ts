import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAddress } from "viem";

import { logger } from "./logger.js";
import { authMiddleware, adminAuthMiddleware, generateApiKey, hashApiKey } from "./auth.js";
import {
  getDb,
  insertApiKey,
  getAllApiKeys,
  revokeApiKey,
  insertWebhook,
  deleteWebhook,
  deleteDeliveriesByWebhook,
  getPendingClaims,
} from "./db.js";
import { registrationApp } from "./registration.js";
import { getFundsList } from "./resources/fundsList.js";
import { getFundFeed } from "./resources/fundFeed.js";
import { getFundActivity } from "./resources/fundActivity.js";
import { getFundProposals } from "./resources/fundProposals.js";
import { getFundStats } from "./resources/fundStats.js";
import { getFundTerms } from "./resources/fundTerms.js";
import { getPositions } from "./resources/positions.js";
import { getManagedFunds } from "./resources/managed.js";
import { toolsRest } from "./tools-rest.js";

// Type for authenticated context
type AuthContext = {
  Variables: {
    keyId: string;
  };
};

const rest = new Hono<AuthContext>();

// CORS is applied globally by http.ts — no duplicate config here.

// Mount registration routes (before auth middleware)
rest.route("/", registrationApp);

// Health check
rest.get("/health", (c) => c.json({ ok: true }));

/**
 * GET /stats
 * Public metrics for the frontend (agent count, fund count)
 */
rest.get("/stats", (c) => {
  try {
    const db = getDb();
    const apiKeyCount = (db.prepare("SELECT COUNT(*) as count FROM api_keys WHERE status = 'active'").get() as { count: number }).count;
    const fundCount = (db.prepare("SELECT COUNT(*) as count FROM funds").get() as { count: number }).count;
    return c.json({ apiKeyCount, fundCount });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /stats", error: message });
    return c.json({ error: message }, 500);
  }
});

// ==================== PUBLIC ENDPOINTS ====================

/**
 * GET /funds
 * Returns list of all funds
 */
rest.get("/funds", async (c) => {
  try {
    const data = await getFundsList();
    return c.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /funds", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /funds/:vaultAddress/events
 * Returns event feed for a fund
 */
rest.get("/funds/:vaultAddress/events", async (c) => {
  try {
    const vaultAddress = c.req.param("vaultAddress");

    if (!isAddress(vaultAddress)) {
      return c.json({ error: "Invalid vault address" }, 400);
    }

    const data = await getFundFeed(vaultAddress);
    return c.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /funds/:vault/events", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /funds/:vaultAddress/activity
 * Returns pre-formatted activity log lines for a fund (0 RPC calls)
 */
rest.get("/funds/:vaultAddress/activity", async (c) => {
  try {
    const vaultAddress = c.req.param("vaultAddress");

    if (!isAddress(vaultAddress)) {
      return c.json({ error: "Invalid vault address" }, 400);
    }

    const data = await getFundActivity(vaultAddress);
    return c.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /funds/:vault/activity", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /funds/:vaultAddress/proposals
 * Returns proposals for a fund
 */
rest.get("/funds/:vaultAddress/proposals", async (c) => {
  try {
    const vaultAddress = c.req.param("vaultAddress");

    if (!isAddress(vaultAddress)) {
      return c.json({ error: "Invalid vault address" }, 400);
    }

    const data = await getFundProposals(vaultAddress);
    return c.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /funds/:vault/proposals", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /funds/:vaultAddress/stats
 * Returns stats for a fund
 */
rest.get("/funds/:vaultAddress/stats", async (c) => {
  try {
    const vaultAddress = c.req.param("vaultAddress");

    if (!isAddress(vaultAddress)) {
      return c.json({ error: "Invalid vault address" }, 400);
    }

    const data = await getFundStats(vaultAddress);
    return c.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /funds/:vault/stats", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /funds/:vaultAddress/terms
 * Returns fund terms (contract parameters)
 */
rest.get("/funds/:vaultAddress/terms", async (c) => {
  try {
    const vaultAddress = c.req.param("vaultAddress");
    if (!isAddress(vaultAddress)) {
      return c.json({ error: "Invalid vault address" }, 400);
    }
    const data = await getFundTerms(vaultAddress);
    return c.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /funds/:vault/terms", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /positions/:address
 * Returns all positions (LP shares) for an address
 */
rest.get("/positions/:address", async (c) => {
  try {
    const address = c.req.param("address");
    if (!isAddress(address)) {
      return c.json({ error: "Invalid address" }, 400);
    }
    const data = await getPositions(address);
    return c.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /positions/:address", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /managed/:address
 * Returns all funds managed by an address
 */
rest.get("/managed/:address", async (c) => {
  try {
    const address = c.req.param("address");
    if (!isAddress(address)) {
      return c.json({ error: "Invalid address" }, 400);
    }
    const data = await getManagedFunds(address);
    return c.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /managed/:address", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /skill.md
 * Serves the skill markdown file as text/plain
 */
rest.get("/skill.md", (c) => {
  try {
    const skillPath = join(process.cwd(), "../skill/SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    c.header("Content-Type", "text/plain");
    return c.body(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /skill.md", error: message });
    return c.json({ error: "Skill file not found" }, 404);
  }
});

/**
 * GET /skill/references/:filename
 * Serves skill reference markdown files as text/plain
 */
rest.get("/skill/references/:filename", (c) => {
  try {
    const filename = c.req.param("filename");
    if (!/^[\w-]+\.md$/.test(filename)) {
      return c.json({ error: "Invalid filename" }, 400);
    }
    const refPath = join(process.cwd(), "../skill/references", filename);
    const content = readFileSync(refPath, "utf-8");
    c.header("Content-Type", "text/plain");
    return c.body(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /skill/references", error: message });
    return c.json({ error: "Reference file not found" }, 404);
  }
});

// ==================== ADMIN ENDPOINTS ====================

/**
 * POST /admin/api-keys
 * Create a new API key (admin only)
 * Body: { "label": string, "rateLimit"?: number }
 */
rest.post("/admin/api-keys", adminAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json();

    if (!body.label || typeof body.label !== "string") {
      return c.json({ error: "Missing or invalid label" }, 400);
    }

    const rateLimit = body.rateLimit ?? 60;

    if (typeof rateLimit !== "number" || rateLimit < 1) {
      return c.json({ error: "Invalid rateLimit" }, 400);
    }

    const id = randomUUID();
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);

    insertApiKey({
      id,
      key_hash: keyHash,
      label: body.label,
      created_at: Date.now(),
      rate_limit: rateLimit,
    });

    return c.json({
      id,
      apiKey,
      label: body.label,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "POST /admin/api-keys", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * DELETE /admin/api-keys/:id
 * Revoke an API key (admin only)
 */
rest.delete("/admin/api-keys/:id", adminAuthMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const revoked = revokeApiKey(id);

    if (!revoked) {
      return c.json({ error: "API key not found" }, 404);
    }

    return c.json({ revoked: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "DELETE /admin/api-keys/:id", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /admin/api-keys
 * List all API keys (admin only)
 */
rest.get("/admin/api-keys", adminAuthMiddleware, async (c) => {
  try {
    const keys = getAllApiKeys();

    const response = keys.map((key) => ({
      id: key.id,
      label: key.label,
      createdAt: key.created_at,
      revoked: key.status === "revoked",
      status: key.status,
      rateLimit: key.rate_limit,
    }));

    return c.json({ keys: response });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /admin/api-keys", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /admin/pending-claims
 * List pending claims (admin only)
 */
rest.get("/admin/pending-claims", adminAuthMiddleware, async (c) => {
  try {
    const claims = getPendingClaims();

    const response = claims.map((claim) => ({
      id: claim.id,
      agentName: claim.agent_name,
      agentDescription: claim.agent_description,
      claimCode: claim.claim_code,
      postUrl: claim.claim_tweet_url,
      postAuthorName: claim.tweet_author_name,
      postAuthorUrl: claim.tweet_author_url,
      claimedByWallet: claim.claimed_by_wallet,
      claimedAt: claim.claimed_at,
      createdAt: claim.created_at,
    }));

    return c.json({ pendingClaims: response });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "GET /admin/pending-claims", error: message });
    return c.json({ error: message }, 500);
  }
});

// ==================== WEBHOOK ENDPOINTS ====================

/**
 * POST /webhooks/register
 * Register a webhook (requires API key auth)
 * Body: { "vaultAddress": string, "callbackUrl": string }
 */
rest.post("/webhooks/register", authMiddleware, async (c) => {
  try {
    const body = await c.req.json();

    if (!body.vaultAddress || typeof body.vaultAddress !== "string") {
      return c.json({ error: "Missing or invalid vaultAddress" }, 400);
    }

    if (!body.callbackUrl || typeof body.callbackUrl !== "string") {
      return c.json({ error: "Missing or invalid callbackUrl" }, 400);
    }

    if (!isAddress(body.vaultAddress)) {
      return c.json({ error: "Invalid vault address" }, 400);
    }

    if (!body.callbackUrl.startsWith("https://")) {
      return c.json({ error: "Callback URL must use HTTPS" }, 400);
    }

    const id = randomUUID();
    const keyId = c.get("keyId") as string;

    insertWebhook({
      id,
      vault: body.vaultAddress,
      callback_url: body.callbackUrl,
      api_key_id: keyId,
      created_at: Date.now(),
    });

    return c.json({ id, registered: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "POST /webhooks/register", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /webhooks/unregister
 * Remove a webhook (requires API key auth)
 * Body: { "id": string }
 */
rest.post("/webhooks/unregister", authMiddleware, async (c) => {
  try {
    const body = await c.req.json();

    if (!body.id || typeof body.id !== "string") {
      return c.json({ error: "Missing or invalid id" }, 400);
    }

    // Delete webhook and associated deliveries
    deleteDeliveriesByWebhook(body.id);
    deleteWebhook(body.id);

    return c.json({ unregistered: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "rest_error", endpoint: "POST /webhooks/unregister", error: message });
    return c.json({ error: message }, 500);
  }
});

// Mount tool endpoints
rest.route("/", toolsRest);

// ── Notification endpoints ──

import {
  resolveVaults, getPendingEvents, getCatchUpEvents,
  getAckFloor, setAckFloor,
} from "./notifications.js";

rest.get("/notifications/pending", authMiddleware, (c) => {
  const keyId = c.get("keyId") as string;
  const row = getDb()
    .prepare("SELECT wallet_address FROM api_keys WHERE id = ?")
    .get(keyId) as { wallet_address: string } | undefined;
  if (!row?.wallet_address) return c.json({ count: 0, events: [] });

  const vaults = resolveVaults(row.wallet_address);
  if (vaults.size === 0) return c.json({ count: 0, events: [] });

  const since = parseInt(c.req.query("since") ?? "0", 10)
    || Math.floor(Date.now() / 1000) - 120;
  const ackFloor = getAckFloor(keyId);
  const events = getPendingEvents({ vaults, since, ackFloor, limit: 50 });

  return c.json({
    count: events.length,
    lastEventId: events.length > 0 ? events[events.length - 1].id : null,
    events,
  });
});

rest.post("/notifications/ack", authMiddleware, async (c) => {
  const keyId = c.get("keyId") as string;
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.lastEventId !== "number" || body.lastEventId <= 0) {
    return c.json({ error: "lastEventId must be a positive integer" }, 400);
  }
  setAckFloor(keyId, body.lastEventId);
  return c.json({ acknowledged: body.lastEventId });
});

rest.get("/notifications", authMiddleware, (c) => {
  const keyId = c.get("keyId") as string;
  const row = getDb()
    .prepare("SELECT wallet_address FROM api_keys WHERE id = ?")
    .get(keyId) as { wallet_address: string } | undefined;
  if (!row?.wallet_address) return c.json({ notifications: [] });

  const sinceParam = c.req.query("since");
  if (!sinceParam) {
    return c.json({ error: "since parameter required (unix timestamp)" }, 400);
  }
  const since = parseInt(sinceParam, 10);
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  const vaults = resolveVaults(row.wallet_address);
  if (vaults.size === 0) return c.json({ notifications: [] });

  const events = getCatchUpEvents({ vaults, since, limit });
  return c.json({ notifications: events });
});

export { rest };
