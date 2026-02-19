/**
 * Shared utilities for resource handlers
 */

import {
  getMetadataFromDb,
  upsertMetadataToDb,
  getAllMetadataFromDb,
} from "../db.js";
import { logger } from "../logger.js";

// Split cache: positive entries (data !== null) never expire (IPFS is immutable).
// Negative entries (data === null) expire after NEGATIVE_CACHE_TTL_MS.
interface CacheEntry {
  data: object | null;
  fetchedAt: number;
}

const metadataCache = new Map<string, CacheEntry>();
const NEGATIVE_CACHE_TTL_MS = 30_000;

// Timeout for IPFS fetch operations (15 seconds)
const IPFS_FETCH_TIMEOUT = 15000;

/**
 * Load all metadata from SQLite into the in-memory cache.
 * Called once at startup so the cache survives server restarts.
 */
export function loadMetadataCacheFromDb(): void {
  const rows = getAllMetadataFromDb();
  for (const row of rows) {
    try {
      const data = JSON.parse(row.json);
      metadataCache.set(row.uri, { data, fetchedAt: Date.now() });
    } catch {
      // Skip corrupt rows
    }
  }
  logger.info({ event: "metadata_cache_loaded", count: rows.length });
}

/**
 * Pre-populate the metadata cache with known-good data.
 * Called after pinning metadata to IPFS — the server already has the content.
 * Write-through: persists to SQLite so it survives restarts.
 */
export function preCacheMetadata(metadataURI: string, metadata: object): void {
  metadataCache.set(metadataURI, { data: metadata, fetchedAt: Date.now() });
  try {
    upsertMetadataToDb(metadataURI, JSON.stringify(metadata));
  } catch (err) {
    logger.error({ event: "metadata_cache_persist_failed", error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Return cached positive metadata if available, null otherwise.
 * Does NOT trigger a fetch — use for list endpoints where fetching is too expensive.
 * Read-through: checks SQLite if not in memory.
 */
export function getCachedMetadata(metadataURI: string): object | null {
  const entry = metadataCache.get(metadataURI);
  if (entry && entry.data !== null) {
    return entry.data;
  }

  // Read-through from SQLite
  try {
    const json = getMetadataFromDb(metadataURI);
    if (json) {
      const data = JSON.parse(json);
      metadataCache.set(metadataURI, { data, fetchedAt: Date.now() });
      return data;
    }
  } catch {
    // SQLite read failed — fall through to null
  }

  return null;
}

/**
 * Fetch metadata from IPFS via Pinata gateway with caching.
 * Returns null on any error (timeout, 404, invalid JSON, etc.)
 * Write-through: persists successful fetches to SQLite.
 */
export async function fetchMetadata(metadataURI: string): Promise<object | null> {
  // Check cache first
  const cached = metadataCache.get(metadataURI);
  if (cached) {
    // Positive cache: never expires (IPFS content is immutable)
    if (cached.data !== null) {
      return cached.data;
    }
    // Negative cache: expires after NEGATIVE_CACHE_TTL_MS
    if (Date.now() - cached.fetchedAt < NEGATIVE_CACHE_TTL_MS) {
      return null;
    }
    // Expired negative entry — delete and re-fetch
    metadataCache.delete(metadataURI);
  }

  try {
    // Convert ipfs:// to https gateway URL
    const cid = metadataURI.replace(/^ipfs:\/\//, "");
    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IPFS_FETCH_TIMEOUT);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn({ event: "ipfs_fetch_failed", uri: metadataURI, status: response.status });
      metadataCache.set(metadataURI, { data: null, fetchedAt: Date.now() });
      return null;
    }

    const metadata = await response.json();
    metadataCache.set(metadataURI, { data: metadata, fetchedAt: Date.now() });
    // Write-through to SQLite
    try {
      upsertMetadataToDb(metadataURI, JSON.stringify(metadata));
    } catch (err) {
      logger.error({ event: "metadata_cache_persist_failed", error: err instanceof Error ? err.message : String(err) });
    }
    return metadata;
  } catch (error) {
    logger.error({ event: "ipfs_fetch_error", uri: metadataURI, error: error instanceof Error ? error.message : String(error) });
    metadataCache.set(metadataURI, { data: null, fetchedAt: Date.now() });
    return null;
  }
}

/**
 * Format seconds countdown as human-readable string.
 * Examples: "2h 15m", "45m", "30s", "executable"
 */
export function formatCountdown(executableAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = executableAt - now;

  if (remaining <= 0) {
    return "executable";
  }

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}
