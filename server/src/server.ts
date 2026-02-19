import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { pinMetadataHandler, pinMetadataSchema } from "./tools/pinMetadata.js";
import { createFundHandler, createFundSchema } from "./tools/createFund.js";
import { depositHandler, depositSchema } from "./tools/deposit.js";
import { refundHandler, refundSchema } from "./tools/refund.js";
import { proposeExecutionHandler, proposeExecutionSchema } from "./tools/proposeExecution.js";
import { vetoExecutionHandler, vetoExecutionSchema } from "./tools/vetoExecution.js";
import { requestWithdrawHandler, requestWithdrawSchema } from "./tools/requestWithdraw.js";
import { claimWithdrawHandler, claimWithdrawSchema } from "./tools/claimWithdraw.js";
import { claimManagementFeeHandler, claimManagementFeeSchema } from "./tools/claimManagementFee.js";

import { windDownFundHandler, windDownFundSchema } from "./tools/windDownFund.js";
import { voteFreezeHandler, voteFreezeSchema } from "./tools/voteFreeze.js";
import { finaliseHandler, finaliseSchema } from "./tools/finalise.js";
import { executeProposalHandler, executeProposalSchema } from "./tools/executeProposal.js";
import { cancelFundHandler, cancelFundSchema } from "./tools/cancelFund.js";
import { cancelFundBeforeExecutionHandler, cancelFundBeforeExecutionSchema } from "./tools/cancelFundBeforeExecution.js";

import { getFundTerms } from "./resources/fundTerms.js";
import { getFundStats } from "./resources/fundStats.js";
import { getFundFeed } from "./resources/fundFeed.js";
import { getFundProposals } from "./resources/fundProposals.js";
import { getFundsList } from "./resources/fundsList.js";
import { getPositions } from "./resources/positions.js";
import { getManagedFunds } from "./resources/managed.js";
import { logger } from "./logger.js";

/**
 * High-level MCP Server instance.
 * Provides server.tool(), server.resource(), server.prompt() registration API.
 * Shared by both stdio and HTTP/SSE transports.
 */
export const server = new McpServer({
  name: "agentic-street",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// 1. pin_metadata
// ---------------------------------------------------------------------------
server.tool(
  "pin_metadata",
  "Pin fund metadata to IPFS via Pinata. Returns { metadataURI } for use in create_fund.",
  pinMetadataSchema,
  async (input) => {
    try {
      const result = await pinMetadataHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 2. create_fund
// ---------------------------------------------------------------------------
server.tool(
  "create_fund",
  "Encode FundFactory.createFund() calldata. Returns unsigned TxData for the agent to sign and broadcast.",
  createFundSchema,
  async (input) => {
    try {
      const result = createFundHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 3. deposit
// ---------------------------------------------------------------------------
server.tool(
  "deposit",
  "Encode USDC.approve + FundRaise.deposit calldata. Returns ordered TxData[] (2 transactions: approve then deposit).",
  depositSchema,
  async (input) => {
    try {
      const result = depositHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 4. refund
// ---------------------------------------------------------------------------
server.tool(
  "refund",
  "Encode FundRaise.refund() calldata. Returns unsigned TxData to reclaim deposited USDC if the raise failed.",
  refundSchema,
  async (input) => {
    try {
      const result = refundHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 5. propose_execution (dual-mode: adapter path or raw call path)
// ---------------------------------------------------------------------------
server.tool(
  "propose_execution",
  "Propose a DeFi operation. Use adapter+action+params for known protocols (instant). Use target+calldata+value for raw calls (delayed, LP veto).",
  proposeExecutionSchema,
  async (input) => {
    try {
      const result = proposeExecutionHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 6. veto_execution
// ---------------------------------------------------------------------------
server.tool(
  "veto_execution",
  "Encode FundVault.vetoExecution(proposalId) calldata. Allows an LP to veto a pending execution proposal.",
  vetoExecutionSchema,
  async (input) => {
    try {
      const result = vetoExecutionHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 7. request_withdraw
// ---------------------------------------------------------------------------
server.tool(
  "request_withdraw",
  "Encode FundVault.requestWithdraw(shares) calldata. Initiates a withdrawal request for the given number of LP shares.",
  requestWithdrawSchema,
  async (input) => {
    try {
      const result = requestWithdrawHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 8. claim_withdraw
// ---------------------------------------------------------------------------
server.tool(
  "claim_withdraw",
  "Encode FundVault.claimWithdraw() calldata. Claims USDC after a withdrawal request has been processed.",
  claimWithdrawSchema,
  async (input) => {
    try {
      const result = claimWithdrawHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 9. claim_management_fee
// ---------------------------------------------------------------------------
server.tool(
  "claim_management_fee",
  "Encode FundVault.claimManagementFee() calldata. Allows the fund manager to claim accrued management fees.",
  claimManagementFeeSchema,
  async (input) => {
    try {
      const result = claimManagementFeeHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 11. wind_down_fund
// ---------------------------------------------------------------------------
server.tool(
  "wind_down_fund",
  "Encode FundVault.windDownFund() calldata. Initiates fund wind-down, enabling LP withdrawals of remaining capital.",
  windDownFundSchema,
  async (input) => {
    try {
      const result = windDownFundHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 12. vote_freeze
// ---------------------------------------------------------------------------
server.tool(
  "vote_freeze",
  "Encode FundVault.voteFreeze() calldata. Allows an LP to vote for freezing the fund in case of emergency.",
  voteFreezeSchema,
  async (input) => {
    try {
      const result = voteFreezeHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 13. finalise
// ---------------------------------------------------------------------------
server.tool(
  "finalise",
  "Encode FundRaise.finalise() calldata. Activates the vault after deposits meet minRaise and the deposit window closes (or maxRaise is hit). Anyone can call.",
  finaliseSchema,
  async (input) => {
    try {
      const result = finaliseHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 14. execute_proposal
// ---------------------------------------------------------------------------
server.tool(
  "execute_proposal",
  "Encode FundVault.executeProposal(proposalId) calldata. Executes a proposal after its time delay has passed. Anyone can call.",
  executeProposalSchema,
  async (input) => {
    try {
      const result = executeProposalHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 15. cancel_fund
// ---------------------------------------------------------------------------
server.tool(
  "cancel_fund",
  "Encode FundRaise.cancelFund() calldata. Cancels a fund during the raising phase. Manager only.",
  cancelFundSchema,
  async (input) => {
    try {
      const result = cancelFundHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// 16. cancel_fund_before_execution
// ---------------------------------------------------------------------------
server.tool(
  "cancel_fund_before_execution",
  "Encode FundVault.cancelFundBeforeExecution() calldata. Cancels an active fund before any proposals have been created. Manager only.",
  cancelFundBeforeExecutionSchema,
  async (input) => {
    try {
      const result = cancelFundBeforeExecutionHandler(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

// ===========================================================================
// RESOURCES - Read-Only Queries
// ===========================================================================

// Resource 1: fund://{vault}/terms
server.resource(
  "fund-terms",
  new ResourceTemplate("fund://{vault}/terms", { list: undefined }),
  { description: "Get fund terms and parameters" },
  async (uri, variables) => {
    try {
      const vault = variables.vault as string;
      const result = await getFundTerms(vault);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error({ event: "mcp_resource_error", uri: uri.href, error: message });
      throw e;
    }
  },
);

// Resource 2: fund://{vault}/stats
server.resource(
  "fund-stats",
  new ResourceTemplate("fund://{vault}/stats", { list: undefined }),
  { description: "Get fund statistics and state" },
  async (uri, variables) => {
    try {
      const vault = variables.vault as string;
      const result = await getFundStats(vault);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error({ event: "mcp_resource_error", uri: uri.href, error: message });
      throw e;
    }
  },
);

// Resource 3: fund://{vault}/feed
server.resource(
  "fund-feed",
  new ResourceTemplate("fund://{vault}/feed", { list: undefined }),
  { description: "Get fund event feed" },
  async (uri, variables) => {
    try {
      const vault = variables.vault as string;
      const result = await getFundFeed(vault);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error({ event: "mcp_resource_error", uri: uri.href, error: message });
      throw e;
    }
  },
);

// Resource 4: fund://{vault}/proposals
server.resource(
  "fund-proposals",
  new ResourceTemplate("fund://{vault}/proposals", { list: undefined }),
  { description: "Get active fund proposals" },
  async (uri, variables) => {
    try {
      const vault = variables.vault as string;
      const result = await getFundProposals(vault);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error({ event: "mcp_resource_error", uri: uri.href, error: message });
      throw e;
    }
  },
);

// Resource 5: funds://list
server.resource(
  "funds-list",
  "funds://list",
  { description: "Get list of all funds" },
  async (uri) => {
    try {
      const result = await getFundsList();
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error({ event: "mcp_resource_error", uri: uri.href, error: message });
      throw e;
    }
  },
);

// Resource 6: funds://positions/{addr}
server.resource(
  "lp-positions",
  new ResourceTemplate("funds://positions/{addr}", { list: undefined }),
  { description: "Get LP positions for an address" },
  async (uri, variables) => {
    try {
      const addr = variables.addr as string;
      const result = await getPositions(addr);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error({ event: "mcp_resource_error", uri: uri.href, error: message });
      throw e;
    }
  },
);

// Resource 7: funds://managed/{addr}
server.resource(
  "managed-funds",
  new ResourceTemplate("funds://managed/{addr}", { list: undefined }),
  { description: "Get funds managed by an address" },
  async (uri, variables) => {
    try {
      const addr = variables.addr as string;
      const result = await getManagedFunds(addr);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error({ event: "mcp_resource_error", uri: uri.href, error: message });
      throw e;
    }
  },
);
