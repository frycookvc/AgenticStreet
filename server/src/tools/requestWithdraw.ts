import { z } from "zod";
import { encodeFunctionData, isAddress } from "viem";
import { FundVaultABI, CHAIN_ID } from "../config.js";
import { type TxData, parseUint256 } from "./types.js";

export const requestWithdrawSchema = {
  vaultAddress: z.string().describe("FundVault contract address"),
  shares: z.string().describe("Number of LP shares to withdraw (uint256)"),
};

export type RequestWithdrawInput = {
  vaultAddress: string;
  shares: string;
};

/**
 * Encodes calldata for FundVault.requestWithdraw(shares).
 */
export function requestWithdrawHandler(input: RequestWithdrawInput): TxData {
  if (!isAddress(input.vaultAddress)) {
    throw new Error(`Invalid vaultAddress: ${input.vaultAddress}`);
  }

  const data = encodeFunctionData({
    abi: FundVaultABI,
    functionName: "requestWithdraw",
    args: [parseUint256(input.shares, "shares")],
  });

  return {
    to: input.vaultAddress as `0x${string}`,
    data,
    value: "0",
    chainId: CHAIN_ID,
  };
}
