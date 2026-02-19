import { Hono } from "hono";
import { randomBytes, createHash, createCipheriv, createDecipheriv, randomInt } from "node:crypto";
import { randomUUID } from "node:crypto";
import { isAddress } from "viem";
import { hashApiKey, authMiddleware } from "./auth.js";
import {
  insertRegistration,
  getApiKeyByClaimToken,
  getApiKeyById,
  updateApiKeyClaim,
  updateApiKeyRetrieved,
  getActiveKeyByWallet,
  updateApiKeyWallet,
} from "./db.js";
import { logger } from "./logger.js";

const CLAIM_BASE_URL = process.env.CLAIM_BASE_URL || "http://localhost:3000";
const CLAIM_TOKEN_TTL = 48 * 60 * 60 * 1000; // 48 hours

// IP-based rate limiter for registration endpoint (5 per hour)
interface IpRateLimitEntry {
  count: number;
  resetAt: number;
}

const IP_RATE_LIMIT_MAX = 5;
const IP_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const ipRateLimitStore = new Map<string, IpRateLimitEntry>();

// Periodic eviction of stale IP rate limit entries to prevent unbounded growth (F8)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipRateLimitStore) {
    if (now > entry.resetAt) ipRateLimitStore.delete(key);
  }
}, 5 * 60_000);

function checkIpRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = ipRateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    // First request or window expired
    ipRateLimitStore.set(ip, {
      count: 1,
      resetAt: now + IP_RATE_LIMIT_WINDOW,
    });
    return { allowed: true };
  }

  if (entry.count >= IP_RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

function generateClaimCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(randomInt(chars.length));
  }
  return `AST-${code}`;
}

function encryptApiKey(apiKey: string, registrationId: string): string {
  const key = createHash("sha256").update(registrationId).digest(); // 32 bytes
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

function decryptApiKey(encryptedStr: string, registrationId: string): string {
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted API key format");
  }
  const [ivHex, ciphertextHex, authTagHex] = parts;
  if (!ivHex || !ciphertextHex || !authTagHex) {
    throw new Error("Invalid encrypted API key format");
  }
  const key = createHash("sha256").update(registrationId).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ── Post verification via X oEmbed ──────────────────────────────────────

interface PostVerification {
  verified: boolean;
  authorName?: string;
  authorUrl?: string;
  error?: string;
}

/**
 * Verify an X post exists and contains the expected claim code.
 * Uses X's free oEmbed API (publish.x.com) — no auth or paid tier required.
 *
 * Returns verified: true + author info on success.
 * Returns verified: false + error message on failure.
 * Never throws — all errors are captured in the return value.
 */
async function verifyPost(postUrl: string, claimCode: string): Promise<PostVerification> {
  try {
    const normalised = postUrl.trim();

    const oembedUrl = `https://publish.x.com/oembed?url=${encodeURIComponent(normalised)}&omit_script=true`;

    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "Accept": "application/json" },
    });

    // 404 = post deleted or nonexistent, 403 = protected/private account
    if (res.status === 404 || res.status === 403) {
      return { verified: false, error: "Post not found or is private" };
    }

    if (!res.ok) {
      return { verified: false, error: `X returned status ${res.status}` };
    }

    const data: Record<string, unknown> = await res.json();

    if (!data.html || typeof data.html !== "string") {
      return { verified: false, error: "Unexpected response from X" };
    }

    // Extract text from the <p> tag inside the oEmbed blockquote.
    // Structure: <blockquote ...><p lang="en" dir="ltr">POST TEXT</p>&mdash; Author ...</blockquote>
    // The <p> regex is robust — this tag is fundamental to oEmbed HTML and has been stable since 2012.
    const pMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!pMatch || !pMatch[1]) {
      return { verified: false, error: "Could not parse post content" };
    }

    // Strip HTML tags (links, mentions, hashtags) and decode HTML entities
    const postText = pMatch[1]
      .replace(/<[^>]+>/g, "")        // strip <a>, <span>, etc.
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&mdash;/g, "—")
      .replace(/&nbsp;/g, " ");

    // Check for claim code (case-insensitive).
    // Codes look like "AST-7K2M" — the prefix + hyphen + alphanumeric chars
    // are extremely unlikely to appear by coincidence in an unrelated post.
    if (!postText.toUpperCase().includes(claimCode.toUpperCase())) {
      return { verified: false, error: "Claim code not found in post" };
    }

    return {
      verified: true,
      authorName: typeof data.author_name === "string" ? data.author_name : undefined,
      authorUrl: typeof data.author_url === "string" ? data.author_url : undefined,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      return { verified: false, error: "X verification timed out" };
    }
    return {
      verified: false,
      error: `Verification failed: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }
}

export const registrationApp = new Hono<{ Variables: { keyId: string } }>();

/**
 * POST /auth/register
 * Self-service registration: agent provides metadata, gets a claim URL
 */
registrationApp.post("/auth/register", async (c) => {
  try {
    // IP-based rate limiting
    const forwardedFor = c.req.header("x-forwarded-for");
    const realIp = c.req.header("x-real-ip");
    const ip = (forwardedFor ? forwardedFor.split(",")[0]?.trim() : null) || realIp || "unknown";

    const rateLimit = checkIpRateLimit(ip);
    if (!rateLimit.allowed) {
      c.header("Retry-After", rateLimit.retryAfter!.toString());
      return c.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.retryAfter },
        429
      );
    }

    const body = await c.req.json();

    // Validate agentName
    if (!body.agentName || typeof body.agentName !== "string") {
      return c.json({ error: "Missing or invalid agentName" }, 400);
    }
    if (body.agentName.length < 1 || body.agentName.length > 100) {
      return c.json({ error: "agentName must be 1-100 characters" }, 400);
    }

    // Validate agentDescription
    if (!body.agentDescription || typeof body.agentDescription !== "string") {
      return c.json({ error: "Missing or invalid agentDescription" }, 400);
    }
    if (body.agentDescription.length < 1 || body.agentDescription.length > 500) {
      return c.json({ error: "agentDescription must be 1-500 characters" }, 400);
    }

    // Validate walletAddress (optional)
    let walletAddress: string | null = null;
    if (body.walletAddress) {
      if (typeof body.walletAddress !== "string") {
        return c.json({ error: "Invalid walletAddress" }, 400);
      }
      if (!isAddress(body.walletAddress)) {
        return c.json({ error: "Invalid wallet address format" }, 400);
      }
      walletAddress = body.walletAddress;

      // Check if wallet already has an active key
      if (walletAddress) {
        const existingKey = getActiveKeyByWallet(walletAddress);
        if (existingKey) {
          return c.json({ error: "Wallet already has an active API key" }, 409);
        }
      }
    }

    // Generate registration data
    const id = randomUUID();
    const claimToken = randomBytes(32).toString("hex");
    const claimCode = generateClaimCode();
    const claimTokenExpiresAt = Date.now() + CLAIM_TOKEN_TTL;

    // Store registration
    insertRegistration({
      id,
      claim_token: claimToken,
      claim_code: claimCode,
      claim_token_expires_at: claimTokenExpiresAt,
      agent_name: body.agentName,
      agent_description: body.agentDescription,
      wallet_address: walletAddress,
      created_at: Date.now(),
      rate_limit: 60,
    });

    const claimUrl = `${CLAIM_BASE_URL}/claim?token=${claimToken}`;

    return c.json({
      registrationId: id,
      status: "unclaimed",
      claimUrl,
      claimCode,
      message: "Send the claim URL to your human. They'll tweet the verification code and your API key will be generated.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "registration_error", endpoint: "POST /auth/register", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /auth/claim-status
 * Check status of a claim token
 */
registrationApp.get("/auth/claim-status", async (c) => {
  try {
    const token = c.req.query("token");

    if (!token) {
      return c.json({ error: "Missing token query parameter" }, 400);
    }

    const record = getApiKeyByClaimToken(token);

    if (!record) {
      return c.json({ error: "Claim link expired or invalid" }, 404);
    }

    // Check if expired
    if (record.claim_token_expires_at && record.claim_token_expires_at < Date.now()) {
      return c.json({ error: "Claim link expired or invalid" }, 404);
    }

    // Check if already claimed
    if (record.status !== "unclaimed") {
      return c.json({ error: "Already claimed" }, 400);
    }

    return c.json({
      agentName: record.agent_name,
      agentDescription: record.agent_description,
      claimCode: record.claim_code,
      expiresAt: record.claim_token_expires_at,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "registration_error", endpoint: "GET /auth/claim-status", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /auth/claim
 * Claim an API key by providing claim token and tweet URL
 */
registrationApp.post("/auth/claim", async (c) => {
  try {
    const body = await c.req.json();

    // Validate claimToken
    if (!body.claimToken || typeof body.claimToken !== "string") {
      return c.json({ error: "Missing or invalid claimToken" }, 400);
    }

    // Validate tweetUrl
    if (!body.tweetUrl || typeof body.tweetUrl !== "string") {
      return c.json({ error: "Missing or invalid tweetUrl" }, 400);
    }

    // Validate post URL format: must be an x.com or twitter.com status link
    const postUrlPattern = /^https?:\/\/(x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+/;
    if (!postUrlPattern.test(body.tweetUrl)) {
      return c.json({ error: "Invalid post URL format. Expected: https://x.com/username/status/123..." }, 400);
    }

    const record = getApiKeyByClaimToken(body.claimToken);

    if (!record) {
      return c.json({ error: "Claim link expired or invalid" }, 404);
    }

    // Check if expired
    if (record.claim_token_expires_at && record.claim_token_expires_at < Date.now()) {
      return c.json({ error: "Claim link expired or invalid" }, 404);
    }

    // Check if already claimed
    if (record.status !== "unclaimed") {
      return c.json({ error: "Already claimed" }, 400);
    }

    // Validate walletAddress (optional)
    let claimedByWallet: string | null = null;
    if (body.walletAddress) {
      if (typeof body.walletAddress !== "string") {
        return c.json({ error: "Invalid walletAddress" }, 400);
      }
      if (!isAddress(body.walletAddress)) {
        return c.json({ error: "Invalid wallet address format" }, 400);
      }
      claimedByWallet = body.walletAddress;
    }

    // ── Verify post via X oEmbed ────────────────────────────────────────
    // Fetches the post from publish.x.com, confirms it exists and contains
    // the claim code. On failure, returns 400 — the claim token is NOT
    // consumed, so the human can fix the issue and retry.
    const verification = await verifyPost(body.tweetUrl, record.claim_code ?? "");
    if (!verification.verified) {
      logger.warn({ event: "claim_verification_failed", registrationId: record.id, agent: record.agent_name, error: verification.error, postUrl: body.tweetUrl });
      return c.json({ error: `Post verification failed: ${verification.error}` }, 400);
    }

    logger.info({ event: "claim_verification_passed", registrationId: record.id, agent: record.agent_name, author: verification.authorName, authorUrl: verification.authorUrl });

    // Generate API key
    const apiKey = `ast_live_${randomBytes(32).toString("hex")}`;
    const keyHash = hashApiKey(apiKey);

    // Encrypt API key for temporary storage
    const encryptedApiKey = encryptApiKey(apiKey, record.id);

    // Update record with verified X identity
    updateApiKeyClaim({
      id: record.id,
      key_hash: keyHash,
      encrypted_api_key: encryptedApiKey,
      claimed_at: Date.now(),
      claim_tweet_url: body.tweetUrl,
      claimed_by_wallet: claimedByWallet,
      tweet_author_name: verification.authorName ?? null,
      tweet_author_url: verification.authorUrl ?? null,
    });

    return c.json({
      apiKey,
      agentName: record.agent_name,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "registration_error", endpoint: "POST /auth/claim", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /auth/registration/:id/status
 * Poll registration status (for agents to retrieve their key after claim)
 * Rate limited per IP to prevent brute-force UUID enumeration.
 */
registrationApp.get("/auth/registration/:id/status", async (c) => {
  try {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = checkIpRateLimit(`status:${ip}`);
    if (!rl.allowed) {
      c.header("Retry-After", String(rl.retryAfter));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    const id = c.req.param("id");

    const record = getApiKeyById(id);

    if (!record) {
      return c.json({ error: "Registration not found" }, 404);
    }

    if (record.status === "unclaimed") {
      return c.json({ status: "unclaimed" });
    }

    if (record.status === "revoked") {
      return c.json({ status: "revoked" });
    }

    if (record.status === "active") {
      // Check if encrypted key still exists
      if (record.encrypted_api_key) {
        // Decrypt and return, then delete
        const apiKey = decryptApiKey(record.encrypted_api_key, id);

        // Update to mark key as retrieved
        updateApiKeyRetrieved(id, Date.now());

        return c.json({
          status: "claimed",
          apiKey,
        });
      } else {
        // Already retrieved
        return c.json({
          status: "claimed",
          keyRetrieved: true,
        });
      }
    }

    return c.json({ error: "Unknown status" }, 500);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "registration_error", endpoint: "GET /auth/registration/:id/status", error: message });
    return c.json({ error: message }, 500);
  }
});

/**
 * PUT /auth/wallet
 * Set or update wallet address for an authenticated agent
 */
registrationApp.put("/auth/wallet", authMiddleware, async (c) => {
  try {
    const keyId = c.get("keyId") as string;
    const body = await c.req.json().catch(() => null);

    if (!body?.walletAddress || typeof body.walletAddress !== "string") {
      return c.json({ error: "Missing or invalid walletAddress" }, 400);
    }
    if (!isAddress(body.walletAddress)) {
      return c.json({ error: "Invalid wallet address format" }, 400);
    }

    const existing = getActiveKeyByWallet(body.walletAddress);
    if (existing && existing.id !== keyId) {
      return c.json({ error: "Wallet already associated with another API key" }, 409);
    }

    const updated = updateApiKeyWallet(keyId, body.walletAddress);
    if (!updated) {
      return c.json({ error: "API key not found or not active" }, 404);
    }

    return c.json({ walletAddress: body.walletAddress, updated: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ event: "registration_error", endpoint: "PUT /auth/wallet", error: message });
    return c.json({ error: message }, 500);
  }
});
