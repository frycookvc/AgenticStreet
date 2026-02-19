import { z } from "zod";
import { encodeFunctionData, isAddress } from "viem";
import {
  FundRaiseABI,
  ERC20ABI,
  USDC_ADDRESS,
  CHAIN_ID,
} from "../config.js";
import { type TxData, parseUint256 } from "./types.js";

export const depositSchema = {
  raiseAddress: z.string().describe("FundRaise contract address"),
  amount: z.string().describe("Deposit amount in USDC base units (uint256)"),
};

export type DepositInput = {
  raiseAddress: string;
  amount: string;
};

/**
 * Encodes a 2-tx bundle: USDC.approve + FundRaise.deposit.
 */
export function depositHandler(input: DepositInput): TxData[] {
  if (!isAddress(input.raiseAddress)) {
    throw new Error(`Invalid raiseAddress: ${input.raiseAddress}`);
  }

  const amount = parseUint256(input.amount, "amount");

  const approveData = encodeFunctionData({
    abi: ERC20ABI,
    functionName: "approve",
    args: [input.raiseAddress as `0x${string}`, amount],
  });

  const depositData = encodeFunctionData({
    abi: FundRaiseABI,
    functionName: "deposit",
    args: [amount],
  });

  return [
    {
      to: USDC_ADDRESS,
      data: approveData,
      value: "0",
      chainId: CHAIN_ID,
    },
    {
      to: input.raiseAddress as `0x${string}`,
      data: depositData,
      value: "0",
      chainId: CHAIN_ID,
    },
  ];
}
