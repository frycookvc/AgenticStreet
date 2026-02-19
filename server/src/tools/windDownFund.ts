import { z } from "zod";
import { encodeFunctionData, isAddress } from "viem";
import { FundVaultABI, CHAIN_ID } from "../config.js";
import type { TxData } from "./types.js";

export const windDownFundSchema = {
  vaultAddress: z.string().describe("FundVault contract address"),
};

export type WindDownFundInput = {
  vaultAddress: string;
};

/**
 * Encodes calldata for FundVault.windDownFund().
 */
export function windDownFundHandler(input: WindDownFundInput): TxData {
  if (!isAddress(input.vaultAddress)) {
    throw new Error(`Invalid vaultAddress: ${input.vaultAddress}`);
  }

  const data = encodeFunctionData({
    abi: FundVaultABI,
    functionName: "windDownFund",
  });

  return {
    to: input.vaultAddress as `0x${string}`,
    data,
    value: "0",
    chainId: CHAIN_ID,
  };
}
