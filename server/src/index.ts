/**
 * Stdio proxy — lightweight MCP client for agents.
 *
 * Receives MCP tool/resource calls via stdin (JSON-RPC),
 * translates each into a REST API request to the hosted server,
 * and returns the result via stdout.
 *
 * Env vars:
 *   AST_API_URL  — hosted server URL (default: https://agenticstreet.ai/api)
 *   AST_API_KEY  — API key for authenticated endpoints
 *
 * No database, no indexer, no webhooks. Pure proxy.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pino from "pino";

// Logger MUST use stderr — stdout is MCP protocol
const logger = pino({ level: "info" }, pino.destination(2));

const API_URL = process.env.AST_API_URL ?? "https://agenticstreet.ai/api";
const API_KEY = process.env.AST_API_KEY ?? "";

const server = new McpServer({ name: "agentic-street", version: "0.1.0" });

// ---------------------------------------------------------------------------
// REST helper
// ---------------------------------------------------------------------------

async function restCall(method: string, path: string, body?: Record<string, unknown>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Helper: wrap a proxy tool call with error handling
// ---------------------------------------------------------------------------

function proxyResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function proxyError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

// ===========================================================================
// TOOLS — each proxies to a REST tool endpoint
// ===========================================================================

// 1. pin_metadata
server.tool(
  "pin_metadata",
  "Pin fund metadata to IPFS via Pinata. Returns { metadataURI } for use in create_fund.",
  {
    name: z.string(),
    description: z.string(),
    managerName: z.string(),
    managerDescription: z.string(),
    strategyType: z.string(),
    riskLevel: z.string(),
    expectedDuration: z.string(),
    minRaise: z.string().optional(),
    maxRaise: z.string().optional(),
    managementFeeBps: z.number().optional(),
    performanceFeeBps: z.number().optional(),
    fundDuration: z.number().optional(),
    depositWindow: z.number().optional(),
    managerAddress: z.string().optional(),
    erc8004AgentId: z.number().int().positive().optional(),
    erc8004RegistryChain: z.string().optional(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", "/metadata/pin", params);
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 2. create_fund
server.tool(
  "create_fund",
  "Encode FundFactory.createFund() calldata. Returns unsigned TxData for the agent to sign and broadcast.",
  {
    managerAddress: z.string(),
    minRaise: z.string(),
    maxRaise: z.string(),
    managementFeeBps: z.number(),
    performanceFeeBps: z.number(),
    fundDuration: z.string(),
    depositWindow: z.string(),
    metadataURI: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", "/funds/create", params);
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 3. deposit
server.tool(
  "deposit",
  "Encode USDC.approve + FundRaise.deposit calldata. Returns ordered TxData[] (2 transactions: approve then deposit).",
  {
    raiseAddress: z.string(),
    amount: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.raiseAddress}/deposit`, { amount: params.amount });
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 4. refund
server.tool(
  "refund",
  "Encode FundRaise.refund() calldata. Returns unsigned TxData to reclaim deposited USDC if the raise failed.",
  {
    raiseAddress: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.raiseAddress}/refund`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 5. propose_execution
server.tool(
  "propose_execution",
  "Encode a proposeExecution() call. Creates a time-delayed proposal on the vault. Returns unsigned TxData.",
  {
    vaultAddress: z.string(),
    target: z.string(),
    calldata: z.string(),
    value: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/propose`, {
        target: params.target,
        calldata: params.calldata,
        value: params.value,
      });
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 6. veto_execution
server.tool(
  "veto_execution",
  "Encode FundVault.vetoExecution(proposalId) calldata. Allows an LP to veto a pending execution proposal.",
  {
    vaultAddress: z.string(),
    proposalId: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/proposals/${params.proposalId}/veto`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 7. request_withdraw
server.tool(
  "request_withdraw",
  "Encode FundVault.requestWithdraw(shares) calldata. Initiates a withdrawal request for the given number of LP shares.",
  {
    vaultAddress: z.string(),
    shares: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/withdraw/request`, { shares: params.shares });
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 8. claim_withdraw
server.tool(
  "claim_withdraw",
  "Encode FundVault.claimWithdraw() calldata. Claims USDC after a withdrawal request has been processed.",
  {
    vaultAddress: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/withdraw/claim`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 9. claim_residual
server.tool(
  "claim_residual",
  "Encode FundVault.claimResidual() calldata. Claims recovered capital after wind-down + freeze. Requires all initial withdrawals complete.",
  {
    vaultAddress: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/withdraw/claim-residual`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 10. claim_management_fee
server.tool(
  "claim_management_fee",
  "Encode FundVault.claimManagementFee() calldata. Allows the fund manager to claim accrued management fees.",
  {
    vaultAddress: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/fees/claim`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 11. return_capital
server.tool(
  "return_capital",
  "Encode USDC.approve + FundVault.returnCapital calldata. Returns ordered TxData[] (2 transactions: approve then return).",
  {
    vaultAddress: z.string(),
    amount: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/capital/return`, { amount: params.amount });
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 12. wind_down_fund
server.tool(
  "wind_down_fund",
  "Encode FundVault.windDownFund() calldata. Initiates fund wind-down, enabling LP withdrawals of remaining capital.",
  {
    vaultAddress: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/wind-down`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 13. vote_freeze
server.tool(
  "vote_freeze",
  "Encode FundVault.voteFreeze() calldata. Allows an LP to vote for freezing the fund in case of emergency.",
  {
    vaultAddress: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/freeze`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 14. finalise
server.tool(
  "finalise",
  "Encode FundRaise.finalise() calldata. Activates the vault after deposits meet minRaise and the deposit window closes.",
  {
    raiseAddress: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.raiseAddress}/finalise`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 15. execute_proposal
server.tool(
  "execute_proposal",
  "Encode FundVault.executeProposal(proposalId) calldata. Executes a proposal after its time delay has passed.",
  {
    vaultAddress: z.string(),
    proposalId: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/proposals/${params.proposalId}/execute`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 16. cancel_fund
server.tool(
  "cancel_fund",
  "Encode FundRaise.cancelFund() calldata. Cancels a fund during the raising phase. Manager only.",
  {
    raiseAddress: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.raiseAddress}/cancel`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// 17. cancel_fund_before_execution
server.tool(
  "cancel_fund_before_execution",
  "Encode FundVault.cancelFundBeforeExecution() calldata. Cancels an active fund before any proposals have been created. Manager only.",
  {
    vaultAddress: z.string(),
  },
  async (params) => {
    try {
      const data = await restCall("POST", `/funds/${params.vaultAddress}/cancel`, {});
      return proxyResult(data);
    } catch (e) {
      return proxyError(e);
    }
  },
);

// ===========================================================================
// RESOURCES — each proxies to a REST GET endpoint
// ===========================================================================

// Resource 1: fund://{vault}/terms
server.resource(
  "fund-terms",
  new ResourceTemplate("fund://{vault}/terms", { list: undefined }),
  { description: "Get fund terms and parameters" },
  async (uri, variables) => {
    const vault = variables.vault as string;
    const data = await restCall("GET", `/funds/${vault}/terms`);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// Resource 2: fund://{vault}/stats
server.resource(
  "fund-stats",
  new ResourceTemplate("fund://{vault}/stats", { list: undefined }),
  { description: "Get fund statistics and state" },
  async (uri, variables) => {
    const vault = variables.vault as string;
    const data = await restCall("GET", `/funds/${vault}/stats`);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// Resource 3: fund://{vault}/feed
server.resource(
  "fund-feed",
  new ResourceTemplate("fund://{vault}/feed", { list: undefined }),
  { description: "Get fund event feed" },
  async (uri, variables) => {
    const vault = variables.vault as string;
    const data = await restCall("GET", `/funds/${vault}/events`);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// Resource 4: fund://{vault}/proposals
server.resource(
  "fund-proposals",
  new ResourceTemplate("fund://{vault}/proposals", { list: undefined }),
  { description: "Get active fund proposals" },
  async (uri, variables) => {
    const vault = variables.vault as string;
    const data = await restCall("GET", `/funds/${vault}/proposals`);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// Resource 5: funds://list
server.resource(
  "funds-list",
  "funds://list",
  { description: "Get list of all funds" },
  async (uri) => {
    const data = await restCall("GET", "/funds");
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// Resource 6: funds://positions/{addr}
server.resource(
  "lp-positions",
  new ResourceTemplate("funds://positions/{addr}", { list: undefined }),
  { description: "Get LP positions for an address" },
  async (uri, variables) => {
    const addr = variables.addr as string;
    const data = await restCall("GET", `/positions/${addr}`);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// Resource 7: funds://managed/{addr}
server.resource(
  "managed-funds",
  new ResourceTemplate("funds://managed/{addr}", { list: undefined }),
  { description: "Get funds managed by an address" },
  async (uri, variables) => {
    const addr = variables.addr as string;
    const data = await restCall("GET", `/managed/${addr}`);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ===========================================================================
// Connect stdio transport
// ===========================================================================

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info({ event: "stdio_proxy_started", apiUrl: API_URL });
