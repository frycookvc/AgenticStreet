import "dotenv/config";

import { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import type { HttpBindings } from "@hono/node-server";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { validateEnv, PORT } from "./config.js";
import { initDb, getDb } from "./db.js";
import { validateApiKey, authMiddleware } from "./auth.js";
import {
  addConnection,
  replay,
  resolveVaults,
  startTimers,
  stopTimers,
} from "./sseManager.js";
import { server } from "./server.js";
import { rest } from "./rest.js";
import { startIndexer } from "./indexer.js";
import { startWebhookQueue } from "./webhookQueue.js";
import { registerHealthRoutes } from "./health.js";
import { registerAdminRoutes } from "./admin.js";
import { registerMcpTransport } from "./mcp-http.js";
import { logger } from "./logger.js";
import { loadMetadataCacheFromDb } from "./resources/utils.js";
import { backfillFundParams, backfillActivationParams, backfillActivityLines } from "./resources/fundParams.js";

// --- Fail fast on missing env vars ---
validateEnv();

// --- Initialize database ---
initDb();

// --- Load metadata cache from SQLite ---
loadMetadataCacheFromDb();

// --- Backfill immutable fund params (fire-and-forget) ---
backfillFundParams();

// --- Backfill activation params for activated funds (fire-and-forget) ---
backfillActivationParams();

// --- Backfill activity lines for existing events ---
backfillActivityLines();

// --- SSE transport state (legacy, kept for backward compat) ---
// Only one SSE client at a time (MVP). New connections replace old ones.
let currentTransport: SSEServerTransport | null = null;

// --- Hono app ---
const app = new Hono<{ Bindings: HttpBindings; Variables: { keyId: string } }>();

// CORS — configurable origin for hosted deployment
app.use("/*", cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["http://localhost:3000", "http://localhost:3001"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  credentials: true,
  maxAge: 86400,
}));

// --- Health check (no auth) ---
registerHealthRoutes(app);

// --- Mount REST routes (public + existing admin + webhooks + tools) ---
app.route("/", rest);

// --- New operational admin endpoints ---
registerAdminRoutes(app);

// --- MCP Streamable HTTP transport ---
registerMcpTransport(app);

// --- Watcher script download (no auth) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let watcherScript: string | null = null;
try {
  watcherScript = readFileSync(join(__dirname, "../static/watcher.sh"), "utf-8");
} catch {
  logger.warn({ event: "watcher_script_missing", msg: "static/watcher.sh not found — /api/watcher.sh will 404" });
}

if (watcherScript) {
  const script = watcherScript;
  app.get("/watcher.sh", (c) => {
    return c.body(script, 200, {
      "Content-Type": "text/x-shellscript",
      "Content-Disposition": 'attachment; filename="ast-watcher.sh"',
      "Cache-Control": "public, max-age=3600",
    });
  });
}

// --- SSE Event Notifications ---
app.get("/events/stream", authMiddleware, async (c) => {
  const keyId = c.get("keyId") as string;
  const row = getDb()
    .prepare("SELECT wallet_address FROM api_keys WHERE id = ?")
    .get(keyId) as { wallet_address: string } | undefined;
  if (!row?.wallet_address) {
    return c.json({ error: "No wallet associated with this key" }, 401);
  }

  const wallet = row.wallet_address;
  const vaults = resolveVaults(wallet);

  const res: ServerResponse = c.env.outgoing;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const connId = addConnection(res, keyId, wallet, vaults);
  if (!connId) {
    res.write('event: error\ndata: {"message":"Too many connections"}\n\n');
    res.end();
    return new Response(null);
  }

  const lastId =
    parseInt(c.req.header("last-event-id") ?? "0", 10) || 0;
  if (lastId > 0) replay(connId, lastId);

  return new Response(null);
});

// --- Legacy SSE transport (kept for backward compat) ---

/**
 * GET /sse — Establish SSE connection for MCP protocol.
 * Requires ?apiKey= query param.
 * Returns an SSE stream; the first event is `endpoint` with the POST URL.
 */
app.get("/sse", async (c) => {
  const apiKey = c.req.query("apiKey");
  if (!apiKey) {
    return c.json({ error: "Missing apiKey query parameter" }, 401);
  }

  const validation = validateApiKey(apiKey);
  if (!validation.valid) {
    return c.json({ error: validation.error ?? "Invalid API key" }, 401);
  }

  c.header("Deprecation", "true");
  c.header("Sunset", "2026-06-01");
  logger.warn({ event: "deprecated_sse_query_auth", msg: "API key passed in query string — use /mcp with Bearer auth" });

  const nodeRes: ServerResponse = c.env.outgoing;

  // Close previous transport if any (single-client MVP)
  if (currentTransport) {
    try {
      await server.close();
    } catch {
      // Ignore close errors on stale connections
    }
    currentTransport = null;
  }

  const transport = new SSEServerTransport("/messages", nodeRes);
  currentTransport = transport;

  await server.connect(transport);
  logger.info({ event: "mcp_sse_connected", sessionId: transport.sessionId });

  return new Response(null);
});

/**
 * POST /messages?sessionId= — Receive JSON-RPC messages from SSE client.
 */
app.post("/messages", async (c) => {
  // Auth check
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const apiKey = authHeader.slice(7);
  const msgValidation = validateApiKey(apiKey);
  if (!msgValidation.valid) {
    return c.json({ error: msgValidation.error ?? "Invalid API key" }, 401);
  }

  const sessionId = c.req.query("sessionId");

  if (!currentTransport || currentTransport.sessionId !== sessionId) {
    return c.json({ error: "Invalid or expired session" }, 400);
  }

  const nodeReq: IncomingMessage = c.env.incoming;
  const nodeRes: ServerResponse = c.env.outgoing;

  await currentTransport.handlePostMessage(nodeReq, nodeRes);

  return new Response(null);
});

// --- Start HTTP server ---
serve({ fetch: app.fetch, port: PORT }, () => {
  logger.info({ event: "server_starting", port: PORT });
});

// --- Start indexer ---
startIndexer();

// --- Start webhook queue processor ---
startWebhookQueue();

// --- Start SSE timers ---
startTimers();

// --- Graceful shutdown ---
process.on("SIGTERM", () => {
  stopTimers();
});
