import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "./auth.js";

// Import all tool handlers and schemas
import { pinMetadataHandler, pinMetadataSchema } from "./tools/pinMetadata.js";
import { createFundHandler, createFundSchema } from "./tools/createFund.js";
import { depositHandler, depositSchema } from "./tools/deposit.js";
import { refundHandler, refundSchema } from "./tools/refund.js";
import { proposeExecutionHandler, proposeExecutionSchema } from "./tools/proposeExecution.js";
import { vetoExecutionHandler, vetoExecutionSchema } from "./tools/vetoExecution.js";
import { requestWithdrawHandler, requestWithdrawSchema } from "./tools/requestWithdraw.js";
import { claimWithdrawHandler, claimWithdrawSchema } from "./tools/claimWithdraw.js";
import { claimResidualHandler, claimResidualSchema } from "./tools/claimResidual.js";
import { claimManagementFeeHandler, claimManagementFeeSchema } from "./tools/claimManagementFee.js";

import { windDownFundHandler, windDownFundSchema } from "./tools/windDownFund.js";
import { voteFreezeHandler, voteFreezeSchema } from "./tools/voteFreeze.js";
import { finaliseHandler, finaliseSchema } from "./tools/finalise.js";
import { executeProposalHandler, executeProposalSchema } from "./tools/executeProposal.js";
import { cancelFundHandler, cancelFundSchema } from "./tools/cancelFund.js";
import { cancelFundBeforeExecutionHandler, cancelFundBeforeExecutionSchema } from "./tools/cancelFundBeforeExecution.js";

// Type for authenticated context
type AuthContext = {
  Variables: {
    keyId: string;
  };
};

const toolsRest = new Hono<AuthContext>();

// Apply auth middleware to tool routes only (scoped to prevent leaking into admin/mcp/sse routes)
toolsRest.use("/metadata/*", authMiddleware);
toolsRest.use("/funds/*", authMiddleware);

/**
 * POST /metadata/pin
 * Pin fund metadata to IPFS via Pinata
 * Body: name, description, managerName, managerDescription, strategyType, riskLevel, expectedDuration, optional fields
 */
toolsRest.post("/metadata/pin", async (c) => {
  try {
    const body = await c.req.json();

    // Validate with Zod
    const schema = z.object(pinMetadataSchema);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    // pinMetadataHandler is async
    const result = await pinMetadataHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/create
 * Create a new fund
 * Body: managerAddress, minRaise, maxRaise, managementFeeBps, performanceFeeBps, fundDuration, depositWindow, metadataURI
 */
toolsRest.post("/funds/create", async (c) => {
  try {
    const body = await c.req.json();

    // Validate with Zod
    const schema = z.object(createFundSchema);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = createFundHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:raise/deposit
 * Deposit USDC into a raising fund
 * Path param: raise (raiseAddress)
 * Body: amount
 */
toolsRest.post("/funds/:raise/deposit", async (c) => {
  try {
    const body = await c.req.json();
    // Merge path param into the body for validation
    const input = { ...body, raiseAddress: c.req.param("raise") };

    // Validate with Zod
    const schema = z.object(depositSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    // Returns TxData[] (array)
    const result = depositHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:raise/refund
 * Withdraw deposited USDC during raising phase
 * Path param: raise (raiseAddress)
 * Body: amount
 */
toolsRest.post("/funds/:raise/refund", async (c) => {
  try {
    const body = await c.req.json();
    // Merge path param into the body for validation
    const input = { ...body, raiseAddress: c.req.param("raise") };

    // Validate with Zod
    const schema = z.object(refundSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = refundHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:vault/propose
 * Propose a DeFi operation (dual-mode).
 * Path param: vault (vaultAddress)
 * Body: { adapter, action, params } OR { target, calldata, value }
 */
toolsRest.post("/funds/:vault/propose", async (c) => {
  try {
    const body = await c.req.json();
    const input = { ...body, vaultAddress: c.req.param("vault") };

    const schema = z.object(proposeExecutionSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = proposeExecutionHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:vault/proposals/:id/veto
 * Veto a pending proposal
 * Path params: vault (vaultAddress), id (proposalId)
 * Body: none (path params only)
 */
toolsRest.post("/funds/:vault/proposals/:id/veto", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); // Allow empty body
    // Merge path params into the body for validation
    const input = {
      ...body,
      vaultAddress: c.req.param("vault"),
      proposalId: c.req.param("id"),
    };

    // Validate with Zod
    const schema = z.object(vetoExecutionSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = vetoExecutionHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:vault/withdraw/request
 * Request a withdrawal from a fund
 * Path param: vault (vaultAddress)
 * Body: shares
 */
toolsRest.post("/funds/:vault/withdraw/request", async (c) => {
  try {
    const body = await c.req.json();
    // Merge path param into the body for validation
    const input = { ...body, vaultAddress: c.req.param("vault") };

    // Validate with Zod
    const schema = z.object(requestWithdrawSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = requestWithdrawHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:vault/withdraw/claim
 * Claim a pending withdrawal
 * Path param: vault (vaultAddress)
 * Body: none (uses msg.sender)
 */
toolsRest.post("/funds/:vault/withdraw/claim", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); // Allow empty body
    // Merge path param into the body for validation
    const input = { ...body, vaultAddress: c.req.param("vault") };

    // Validate with Zod
    const schema = z.object(claimWithdrawSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = claimWithdrawHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:vault/withdraw/claim-residual
 * Claim residual capital after wind-down + freeze
 * Path param: vault (vaultAddress)
 * Body: none (uses msg.sender)
 */
toolsRest.post("/funds/:vault/withdraw/claim-residual", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); // Allow empty body
    // Merge path param into the body for validation
    const input = { ...body, vaultAddress: c.req.param("vault") };

    // Validate with Zod
    const schema = z.object(claimResidualSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = claimResidualHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:vault/fees/claim
 * Claim accrued management fees
 * Path param: vault (vaultAddress)
 * Body: none (uses msg.sender)
 */
toolsRest.post("/funds/:vault/fees/claim", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); // Allow empty body
    // Merge path param into the body for validation
    const input = { ...body, vaultAddress: c.req.param("vault") };

    // Validate with Zod
    const schema = z.object(claimManagementFeeSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = claimManagementFeeHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:vault/wind-down
 * Initiate fund wind-down
 * Path param: vault (vaultAddress)
 * Body: none (uses msg.sender)
 */
toolsRest.post("/funds/:vault/wind-down", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); // Allow empty body
    // Merge path param into the body for validation
    const input = { ...body, vaultAddress: c.req.param("vault") };

    // Validate with Zod
    const schema = z.object(windDownFundSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = windDownFundHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:vault/freeze
 * Vote to freeze the fund due to manager misconduct
 * Path param: vault (vaultAddress)
 * Body: none (uses msg.sender)
 */
toolsRest.post("/funds/:vault/freeze", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); // Allow empty body
    // Merge path param into the body for validation
    const input = { ...body, vaultAddress: c.req.param("vault") };

    // Validate with Zod
    const schema = z.object(voteFreezeSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = voteFreezeHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:raise/finalise
 * Finalise a fund after deposits meet minRaise
 * Path param: raise (raiseAddress)
 * Body: none
 */
toolsRest.post("/funds/:raise/finalise", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); // Allow empty body
    const input = { ...body, raiseAddress: c.req.param("raise") };

    const schema = z.object(finaliseSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = finaliseHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:vault/proposals/:id/execute
 * Execute a proposal after its time delay has passed
 * Path params: vault (vaultAddress), id (proposalId)
 * Body: none
 */
toolsRest.post("/funds/:vault/proposals/:id/execute", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); // Allow empty body
    const input = {
      ...body,
      vaultAddress: c.req.param("vault"),
      proposalId: c.req.param("id"),
    };

    const schema = z.object(executeProposalSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = executeProposalHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:raise/cancel
 * Cancel a fund during the raising phase
 * Path param: raise (raiseAddress)
 * Body: none
 */
toolsRest.post("/funds/:raise/cancel", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); // Allow empty body
    const input = { ...body, raiseAddress: c.req.param("raise") };

    const schema = z.object(cancelFundSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = cancelFundHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /funds/:vault/cancel
 * Cancel an active fund before any proposals have been created
 * Path param: vault (vaultAddress)
 * Body: none
 */
toolsRest.post("/funds/:vault/cancel", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); // Allow empty body
    const input = { ...body, vaultAddress: c.req.param("vault") };

    const schema = z.object(cancelFundBeforeExecutionSchema);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Validation failed";
      return c.json({ error: errorMsg }, 400);
    }

    const result = cancelFundBeforeExecutionHandler(parsed.data);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
});

export { toolsRest };
