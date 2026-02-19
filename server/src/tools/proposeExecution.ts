import { z } from "zod";
import { encodeFunctionData, isAddress } from "viem";
import { encodeAdapterCall } from "../adapterCodec.js";
import { FundVaultABI, CHAIN_ID } from "../config.js";
import { type TxData, parseUint256 } from "./types.js";

export const proposeExecutionSchema = {
  vaultAddress: z.string().describe("FundVault contract address"),
  // Adapter path fields
  adapter: z.string().optional().describe("Adapter name: uniswap_v3 or aave_v3. Mutually exclusive with target."),
  action: z.string().optional().describe("Adapter action name (e.g. swapExactInputSingle, supply)"),
  params: z.record(z.string(), z.unknown()).optional().describe("Action-specific parameters"),
  // Raw call path fields
  target: z.string().optional().describe("Target contract address for raw call. Mutually exclusive with adapter."),
  calldata: z.string().optional().describe("0x-prefixed hex calldata for raw call"),
  value: z.string().optional().describe("ETH value in wei (usually '0')"),
};

export type ProposeExecutionInput = {
  vaultAddress: string;
  adapter?: string;
  action?: string;
  params?: Record<string, unknown>;
  target?: string;
  calldata?: string;
  value?: string;
};

/**
 * Encodes calldata for FundVault.proposeExecution(target, data, value).
 * Supports two mutually exclusive input modes:
 * - Adapter path: { adapter, action, params } → instant execution (whitelisted)
 * - Raw call path: { target, calldata, value } → delayed execution with LP veto
 */
export function proposeExecutionHandler(input: ProposeExecutionInput): TxData {
  if (!isAddress(input.vaultAddress)) {
    throw new Error(`Invalid vaultAddress: ${input.vaultAddress}`);
  }

  const hasAdapter = !!input.adapter;
  const hasTarget = !!input.target;

  if (hasAdapter === hasTarget) {
    throw new Error("Provide either 'adapter' (adapter path) or 'target' (raw call path), not both or neither.");
  }

  let resolvedTarget: `0x${string}`;
  let resolvedData: `0x${string}`;
  let callValue: bigint;

  if (hasAdapter) {
    const { adapter, action, params } = input;
    if (!action) throw new Error("Missing 'action' for adapter path");
    if (!params) throw new Error("Missing 'params' for adapter path");

    const encoded = encodeAdapterCall(adapter!, action, params);
    resolvedTarget = encoded.adapterAddress;
    resolvedData = encoded.encodedCalldata;
    callValue = 0n;
  } else {
    if (!isAddress(input.target!)) {
      throw new Error(`Invalid target address: ${input.target}`);
    }
    if (!input.calldata || !/^0x[0-9a-fA-F]*$/.test(input.calldata)) {
      throw new Error("Invalid calldata: must be 0x-prefixed hex");
    }
    resolvedTarget = input.target as `0x${string}`;
    resolvedData = input.calldata as `0x${string}`;
    callValue = parseUint256(input.value ?? "0", "value");
  }

  const data = encodeFunctionData({
    abi: FundVaultABI,
    functionName: "proposeExecution",
    args: [resolvedTarget, resolvedData, callValue],
  });

  return {
    to: input.vaultAddress as `0x${string}`,
    data,
    value: "0",
    chainId: CHAIN_ID,
  };
}
