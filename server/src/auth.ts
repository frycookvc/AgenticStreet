import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getApiKeyByHash, type ApiKeyRecord } from "./db.js";

/**
 * Constant-time string comparison to prevent timing attacks.
 * Handles different-length strings safely (timingSafeEqual requires same-length buffers).
 */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to burn the same time, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// Rate limiter: in-memory token bucket (sliding window)
interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

export const RATE_LIMIT_MAX = 300; // 300 req/min — sized for AI agent traffic
const RATE_LIMIT_WINDOW = 60_000; // 1 minute in ms
const rateLimitStore = new Map<string, RateLimitEntry>();

// Periodic eviction of stale rate limit entries to prevent unbounded growth (F8)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.lastRefill > RATE_LIMIT_WINDOW) rateLimitStore.delete(key);
  }
}, 5 * 60_000);

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new API key with ast_live_ prefix
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(32).toString("hex");
  return `ast_live_${randomPart}`;
}

/**
 * Validate an API key by checking its hash in the database
 */
export function validateApiKey(key: string): {
  valid: boolean;
  keyId?: string;
  rateLimit?: number;
  error?: string;
} {
  if (!key.startsWith("ast_live_")) {
    return { valid: false, error: "Invalid key format" };
  }

  const hash = hashApiKey(key);

  const record = getApiKeyByHash(hash);
  if (!record) {
    return { valid: false, error: "API key not found" };
  }
  if (record.status === "revoked") {
    return { valid: false, error: "API key revoked" };
  }
  if (record.status !== "active") {
    return { valid: false, error: "API key not active" };
  }
  return { valid: true, keyId: record.id, rateLimit: record.rate_limit };
}

/**
 * Check rate limit for a given key ID
 * Returns true if request is allowed, false if rate limit exceeded
 */
export function checkRateLimit(keyId: string, rateLimit: number): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(keyId);

  if (!entry) {
    // First request from this key
    rateLimitStore.set(keyId, {
      tokens: rateLimit - 1,
      lastRefill: now,
    });
    return { allowed: true };
  }

  // Calculate tokens to add based on time elapsed (token bucket algorithm)
  const elapsed = now - entry.lastRefill;
  const tokensToAdd = (elapsed / RATE_LIMIT_WINDOW) * rateLimit;
  const newTokens = Math.min(rateLimit, entry.tokens + tokensToAdd);

  if (newTokens < 1) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((1 - newTokens) * (RATE_LIMIT_WINDOW / rateLimit) / 1000);
    return { allowed: false, retryAfter };
  }

  // Update tokens
  rateLimitStore.set(keyId, {
    tokens: newTokens - 1,
    lastRefill: now,
  });

  return { allowed: true };
}

/**
 * Hono middleware for API key authentication
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer " prefix
  const validation = validateApiKey(apiKey);

  if (!validation.valid) {
    return c.json({ error: validation.error || "Invalid API key" }, 401);
  }

  // Check rate limit
  const rateLimit = checkRateLimit(validation.keyId!, validation.rateLimit ?? RATE_LIMIT_MAX);
  if (!rateLimit.allowed) {
    c.header("Retry-After", rateLimit.retryAfter!.toString());
    return c.json(
      { error: "Rate limit exceeded", retryAfter: rateLimit.retryAfter },
      429
    );
  }

  // Store keyId in context for downstream handlers
  c.set("keyId", validation.keyId);

  await next();
}

/**
 * Hono middleware for admin authentication
 * Checks Authorization header against ADMIN_API_KEY env var
 */
export async function adminAuthMiddleware(c: Context, next: Next) {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    return c.json({ error: "Admin authentication not configured" }, 500);
  }

  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const providedKey = authHeader.slice(7);

  if (!constantTimeEqual(providedKey, adminKey)) {
    return c.json({ error: "Invalid admin key" }, 401);
  }

  await next();
}
