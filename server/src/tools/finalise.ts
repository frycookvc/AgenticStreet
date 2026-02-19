import { z } from "zod";
import { encodeFunctionData, isAddress } from "viem";
import { FundRaiseABI, CHAIN_ID } from "../config.js";
import { getFundByVault } from "../db.js";
import type { TxData } from "./types.js";

export const finaliseSchema = {
  raiseAddress: z.string().describe("FundRaise contract address (NOT the vault address)"),
};

export type FinaliseInput = {
  raiseAddress: string;
};

/**
 * Encodes calldata for FundRaise.finalise().
 */
export function finaliseHandler(input: FinaliseInput): TxData {
  if (!isAddress(input.raiseAddress)) {
    throw new Error(`Invalid raiseAddress: ${input.raiseAddress}`);
  }

  try {
    const fund = getFundByVault(input.raiseAddress);
    if (fund) {
      throw new Error(
        `${input.raiseAddress} is a VAULT address, not a raise address. ` +
        `Use the raise address instead: ${fund.raise}`
      );
    }
  } catch (e) {
    // Re-throw vault-address errors, ignore DB-not-initialized errors
    if (e instanceof Error && e.message.includes("VAULT address")) throw e;
  }

  const data = encodeFunctionData({
    abi: FundRaiseABI,
    functionName: "finalise",
  });

  return {
    to: input.raiseAddress as `0x${string}`,
    data,
    value: "0",
    chainId: CHAIN_ID,
  };
}
