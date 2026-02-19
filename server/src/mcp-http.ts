import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { server as mcpServer } from "./server.js";
import { validateApiKey, checkRateLimit, RATE_LIMIT_MAX } from "./auth.js";
import { logger } from "./logger.js";

/**
 * Register MCP Streamable HTTP transport on POST /mcp and GET /mcp.
 * Stateless for MVP — each request creates a new transport instance.
 * Auth: Bearer API key (same as REST write endpoints).
 */
// biome-ignore lint: Hono generic variance requires any here
export function registerMcpTransport(app: Hono<any>) {
  // POST /mcp — JSON-RPC tool calls
  app.post("/mcp", async (c) => {
    // Auth check
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }
    const apiKey = authHeader.slice(7);
    const validation = validateApiKey(apiKey);
    if (!validation.valid) {
      return c.json({ error: validation.error ?? "Invalid API key" }, 401);
    }

    const rl = checkRateLimit(validation.keyId!, validation.rateLimit ?? RATE_LIMIT_MAX);
    if (!rl.allowed) {
      c.header("Retry-After", String(rl.retryAfter));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    // Get raw Node.js req/res for the transport
    const nodeReq: IncomingMessage = c.env.incoming;
    const nodeRes: ServerResponse = c.env.outgoing;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless for MVP
    });

    await mcpServer.connect(transport);

    // Parse the body and pass it to handleRequest
    const body = await c.req.json();
    await transport.handleRequest(nodeReq, nodeRes, body);

    // The transport already wrote the response
    return new Response(null);
  });

  // GET /mcp — SSE streaming endpoint
  app.get("/mcp", async (c) => {
    // Auth check
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }
    const apiKey = authHeader.slice(7);
    const validation = validateApiKey(apiKey);
    if (!validation.valid) {
      return c.json({ error: validation.error ?? "Invalid API key" }, 401);
    }

    const rlGet = checkRateLimit(validation.keyId!, validation.rateLimit ?? RATE_LIMIT_MAX);
    if (!rlGet.allowed) {
      c.header("Retry-After", String(rlGet.retryAfter));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    const nodeReq: IncomingMessage = c.env.incoming;
    const nodeRes: ServerResponse = c.env.outgoing;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(nodeReq, nodeRes);

    return new Response(null);
  });

  // DELETE /mcp — Session termination (required by spec)
  app.delete("/mcp", async (c) => {
    // Auth check (consistent with POST/GET)
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }
    const apiKey = authHeader.slice(7);
    const validation = validateApiKey(apiKey);
    if (!validation.valid) {
      return c.json({ error: validation.error ?? "Invalid API key" }, 401);
    }

    const rlDel = checkRateLimit(validation.keyId!, validation.rateLimit ?? RATE_LIMIT_MAX);
    if (!rlDel.allowed) {
      c.header("Retry-After", String(rlDel.retryAfter));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    return c.json({ error: "Session termination not supported (stateless mode)" }, 405);
  });

  logger.info({ event: "mcp_http_transport_registered", path: "/mcp" });
}
