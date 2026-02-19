import type { Hono } from "hono";
import { getDb } from "./db.js";
import { getIndexerState } from "./indexer.js";
import { logger } from "./logger.js";

const startTime = Date.now();

// biome-ignore lint: Hono generic variance requires any here
export function registerHealthRoutes(app: Hono<any>) {
  app.get("/health", (c) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    let dbStatus = "ok";
    try {
      const db = getDb();
      db.prepare("SELECT 1").get();
    } catch (err) {
      dbStatus = "unreachable";
      logger.error({ event: "health_check_db_fail", error: err instanceof Error ? err.message : String(err) });
    }

    const indexerState = getIndexerState();
    const indexerLagSeconds = indexerState.lastPollTime
      ? Math.floor((Date.now() - indexerState.lastPollTime) / 1000)
      : -1;

    const degraded = dbStatus !== "ok" || indexerLagSeconds > 60;

    return c.json({
      status: degraded ? "degraded" : "ok",
      uptime,
      database: dbStatus,
      indexerLagSeconds,
    }, degraded ? 503 : 200);
  });
}
