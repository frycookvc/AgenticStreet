import { z } from "zod";
import { encodeFunctionData, isAddress } from "viem";
import { FundRaiseABI, CHAIN_ID } from "../config.js";
import type { TxData } from "./types.js";

export const cancelFundSchema = {
  raiseAddress: z.string().describe("FundRaise contract address"),
};

export type CancelFundInput = {
  raiseAddress: string;
};

/**
 * Encodes calldata for FundRaise.cancelFund().
 */
export function cancelFundHandler(input: CancelFundInput): TxData {
  if (!isAddress(input.raiseAddress)) {
    throw new Error(`Invalid raiseAddress: ${input.raiseAddress}`);
  }

  const data = encodeFunctionData({
    abi: FundRaiseABI,
    functionName: "cancelFund",
  });

  return {
    to: input.raiseAddress as `0x${string}`,
    data,
    value: "0",
    chainId: CHAIN_ID,
  };
}
