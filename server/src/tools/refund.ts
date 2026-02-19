import { z } from "zod";
import { encodeFunctionData, isAddress } from "viem";
import { FundRaiseABI, CHAIN_ID } from "../config.js";
import type { TxData } from "./types.js";

export const refundSchema = {
  raiseAddress: z.string().describe("FundRaise contract address"),
};

export type RefundInput = {
  raiseAddress: string;
};

/**
 * Encodes calldata for FundRaise.refund().
 */
export function refundHandler(input: RefundInput): TxData {
  if (!isAddress(input.raiseAddress)) {
    throw new Error(`Invalid raiseAddress: ${input.raiseAddress}`);
  }

  const data = encodeFunctionData({
    abi: FundRaiseABI,
    functionName: "refund",
  });

  return {
    to: input.raiseAddress as `0x${string}`,
    data,
    value: "0",
    chainId: CHAIN_ID,
  };
}
