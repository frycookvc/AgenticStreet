import { z } from "zod";
import { encodeFunctionData, isAddress } from "viem";
import { FundVaultABI, CHAIN_ID } from "../config.js";
import { type TxData, parseUint256 } from "./types.js";

export const executeProposalSchema = {
  vaultAddress: z.string().describe("FundVault contract address"),
  proposalId: z.string().describe("Proposal ID to execute (uint256)"),
};

export type ExecuteProposalInput = {
  vaultAddress: string;
  proposalId: string;
};

/**
 * Encodes calldata for FundVault.executeProposal(proposalId).
 */
export function executeProposalHandler(input: ExecuteProposalInput): TxData {
  if (!isAddress(input.vaultAddress)) {
    throw new Error(`Invalid vaultAddress: ${input.vaultAddress}`);
  }

  const data = encodeFunctionData({
    abi: FundVaultABI,
    functionName: "executeProposal",
    args: [parseUint256(input.proposalId, "proposalId")],
  });

  return {
    to: input.vaultAddress as `0x${string}`,
    data,
    value: "0",
    chainId: CHAIN_ID,
  };
}
