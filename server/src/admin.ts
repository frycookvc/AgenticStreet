import path from "node:path";
import fs from "node:fs";
import type { Hono } from "hono";
import { adminAuthMiddleware } from "./auth.js";
import { getDb } from "./db.js";
import { getIndexerState } from "./indexer.js";
import { logger, getLogBuffer } from "./logger.js";
import { DB_PATH, POLL_INTERVAL_MS } from "./config.js";

// biome-ignore lint: Hono generic variance requires any here
export function registerAdminRoutes(app: Hono<any>) {
  // GET /admin/stats
  app.get("/admin/stats", adminAuthMiddleware, (c) => {
    const db = getDb();
    const fundsByStatus = db.prepare(
      "SELECT status, COUNT(*) as count FROM funds GROUP BY status"
    ).all();
    const agentCount = (db.prepare(
      "SELECT COUNT(*) as count FROM api_keys WHERE status = 'active'"
    ).get() as { count: number }).count;
    const pendingProposals = (db.prepare(
      "SELECT COUNT(*) as count FROM events WHERE event_name = 'ProposalCreated'"
    ).get() as { count: number }).count;
    const activeWebhooks = (db.prepare(
      "SELECT COUNT(*) as count FROM webhooks"
    ).get() as { count: number }).count;
    return c.json({ fundsByStatus, agentCount, pendingProposals, activeWebhooks });
  });

  // GET /admin/indexer
  app.get("/admin/indexer", adminAuthMiddleware, (c) => {
    const state = getIndexerState();
    const eventsToday = (getDb().prepare(
      "SELECT COUNT(*) as count FROM events WHERE timestamp > ?"
    ).get(Math.floor(Date.now() / 1000) - 86400) as { count: number }).count;
    return c.json({
      lastIndexedBlock: state.lastIndexedBlock,
      lastPollTime: state.lastPollTime ? new Date(state.lastPollTime).toISOString() : null,
      lagSeconds: state.lastPollTime ? Math.floor((Date.now() - state.lastPollTime) / 1000) : -1,
      eventsIndexedLast24h: eventsToday,
      pollIntervalMs: POLL_INTERVAL_MS,
    });
  });

  // GET /admin/webhooks
  app.get("/admin/webhooks", adminAuthMiddleware, (c) => {
    const webhooks = getDb().prepare(`
      SELECT w.id, w.vault, w.callback_url,
        (SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = w.id AND status = 'delivered') as successes,
        (SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = w.id AND status = 'dead') as dead,
        (SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = w.id AND status = 'pending') as pending
      FROM webhooks w
    `).all();
    return c.json({ webhooks });
  });

  // POST /admin/backup
  app.post("/admin/backup", adminAuthMiddleware, (c) => {
    const db = getDb();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(path.dirname(DB_PATH), "backups");
    const backupPath = path.join(backupDir, `ast-${timestamp}.db`);
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      db.backup(backupPath);
      const backupFilename = `ast-${timestamp}.db`;
      logger.info({ event: "backup_created", path: backupPath });
      return c.json({ backup: backupFilename, status: "ok" });
    } catch (err) {
      logger.error({ event: "backup_failed", error: err instanceof Error ? err.message : String(err) });
      return c.json({ error: "Backup failed", detail: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // GET /admin/logs
  app.get("/admin/logs", adminAuthMiddleware, (c) => {
    const level = c.req.query("level");
    const limit = Number(c.req.query("limit") ?? 200);
    let logs = getLogBuffer();
    if (level) logs = logs.filter((l) => l.level === level);
    return c.json({ logs: logs.slice(-limit) });
  });

  // POST /admin/db/clear — TESTNET ONLY (disabled in production)
  app.post("/admin/db/clear", adminAuthMiddleware, async (c) => {
    if (process.env.NODE_ENV === "production") {
      return c.json({ error: "Not available in production" }, 403);
    }
    const body = await c.req.json();
    if (body.confirm !== "DELETE_ALL_DATA") {
      return c.json({ error: 'Must include {"confirm": "DELETE_ALL_DATA"}' }, 400);
    }
    const db = getDb();
    db.exec("DELETE FROM webhook_deliveries");
    db.exec("DELETE FROM webhooks");
    db.exec("DELETE FROM events");
    db.exec("DELETE FROM activity_lines");
    db.exec("DELETE FROM funds");
    db.exec("DELETE FROM api_keys");
    db.exec("DELETE FROM indexer_state");
    db.exec("DELETE FROM metadata_cache");
    logger.warn({ event: "database_cleared" });
    return c.json({ cleared: true });
  });

  // POST /admin/server/restart
  app.post("/admin/server/restart", adminAuthMiddleware, (c) => {
    logger.warn({ event: "graceful_shutdown_requested" });
    setTimeout(() => {
      try {
        const db = getDb();
        db.pragma("wal_checkpoint(TRUNCATE)");
        db.close();
      } catch {
        // Best-effort cleanup
      }
      process.kill(process.pid, "SIGTERM");
      // Docker restart: unless-stopped brings the container back
    }, 100);
    return c.json({ restarting: true });
  });
}
