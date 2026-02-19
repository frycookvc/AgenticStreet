import pino from "pino";

const LOG_BUFFER_SIZE = 500;
const logBuffer: Record<string, unknown>[] = [];

const SENSITIVE_KEYS = new Set([
  "apiKey", "api_key", "apikey",
  "key", "key_hash", "keyHash",
  "token", "claim_token", "claimToken",
  "secret", "password",
  "authorization", "auth", "bearer",
  "encrypted_api_key", "encryptedApiKey",
  "jwt", "pinataJwt",
]);

/**
 * Recursively redact sensitive fields from a log entry.
 * Also catches ast_live_ prefixed strings regardless of key name.
 */
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k)) {
      result[k] = "[REDACTED]";
    } else if (typeof v === "string" && v.startsWith("ast_live_")) {
      result[k] = "[REDACTED]";
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      result[k] = redactSensitive(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export function getLogBuffer(): Record<string, unknown>[] {
  return logBuffer;
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    hooks: {
      logMethod(inputArgs, method, level) {
        const raw = {
          ts: new Date().toISOString(),
          level: pino.levels.labels[level],
          ...(typeof inputArgs[0] === "object" && inputArgs[0] !== null
            ? inputArgs[0]
            : { msg: inputArgs[0] }),
        };
        const entry = redactSensitive(raw);
        logBuffer.push(entry);
        if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
        method.apply(this, inputArgs);
      },
    },
  },
  pino.destination(2), // stderr — keeps stdout clean for MCP stdio transport
);
