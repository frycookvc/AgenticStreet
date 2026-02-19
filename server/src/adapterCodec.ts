import { encodeFunctionData, decodeFunctionData } from "viem";
import { z } from "zod";
import { ADAPTERS, ADAPTER_BY_ADDRESS, tokenSymbol, formatTokenAmount } from "./config.js";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const uint256Schema = z.string().regex(/^\d+$/);
const bytesSchema = z.string().regex(/^0x[a-fA-F0-9]*$/);
const uint24Schema = z.number().int().positive().max(16_777_215);

const ACTION_SCHEMAS = {
  uniswap_v3: {
    swapExactInputSingle: z.object({
      tokenIn: addressSchema,
      tokenOut: addressSchema,
      fee: uint24Schema,
      amountIn: uint256Schema,
      amountOutMin: uint256Schema,
    }),
    swapExactInput: z.object({
      path: bytesSchema,
      tokenIn: addressSchema,
      tokenOut: addressSchema,
      amountIn: uint256Schema,
      amountOutMin: uint256Schema,
    }),
  },
  aave_v3: {
    supply: z.object({ token: addressSchema, amount: uint256Schema }),
    withdraw: z.object({ token: addressSchema, amount: uint256Schema }),
    borrow: z.object({ token: addressSchema, amount: uint256Schema, interestRateMode: uint256Schema }),
    repay: z.object({ token: addressSchema, amount: uint256Schema, interestRateMode: uint256Schema }),
  },
} as const;

type AdapterKey = keyof typeof ADAPTERS;
type ActionKey<A extends AdapterKey> = keyof (typeof ACTION_SCHEMAS)[A];

function buildArgs(adapter: string, action: string, params: Record<string, unknown>): unknown[] {
  if (adapter === "uniswap_v3") {
    if (action === "swapExactInputSingle") {
      const p = params as { tokenIn: string; tokenOut: string; fee: number; amountIn: string; amountOutMin: string };
      return [p.tokenIn, p.tokenOut, p.fee, BigInt(p.amountIn), BigInt(p.amountOutMin)];
    }
    if (action === "swapExactInput") {
      const p = params as { path: string; tokenIn: string; tokenOut: string; amountIn: string; amountOutMin: string };
      return [p.path, p.tokenIn, p.tokenOut, BigInt(p.amountIn), BigInt(p.amountOutMin)];
    }
  }
  if (adapter === "aave_v3") {
    if (action === "supply" || action === "withdraw") {
      const p = params as { token: string; amount: string };
      return [p.token, BigInt(p.amount)];
    }
    if (action === "borrow" || action === "repay") {
      const p = params as { token: string; amount: string; interestRateMode: string };
      return [p.token, BigInt(p.amount), BigInt(p.interestRateMode)];
    }
  }
  throw new Error(`No arg builder for ${adapter}.${action}`);
}

function argsToParams(adapter: string, action: string, args: readonly unknown[]): Record<string, unknown> {
  if (adapter === "uniswap_v3") {
    if (action === "swapExactInputSingle") {
      const [tokenIn, tokenOut, fee, amountIn, amountOutMin] = args as [string, string, number, bigint, bigint];
      return { tokenIn, tokenOut, fee: Number(fee), amountIn: String(amountIn), amountOutMin: String(amountOutMin) };
    }
    if (action === "swapExactInput") {
      const [path, tokenIn, tokenOut, amountIn, amountOutMin] = args as [string, string, string, bigint, bigint];
      return { path, tokenIn, tokenOut, amountIn: String(amountIn), amountOutMin: String(amountOutMin) };
    }
  }
  if (adapter === "aave_v3") {
    if (action === "supply" || action === "withdraw") {
      const [token, amount] = args as [string, bigint];
      return { token, amount: String(amount) };
    }
    if (action === "borrow" || action === "repay") {
      const [token, amount, interestRateMode] = args as [string, bigint, bigint];
      return { token, amount: String(amount), interestRateMode: String(interestRateMode) };
    }
  }
  // Fallback: numeric keys
  const result: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    result[String(i)] = typeof args[i] === "bigint" ? String(args[i]) : args[i];
  }
  return result;
}

export function encodeAdapterCall(
  adapter: string,
  action: string,
  params: Record<string, unknown>,
): { adapterAddress: `0x${string}`; encodedCalldata: `0x${string}` } {
  const adapterConfig = ADAPTERS[adapter as AdapterKey];
  if (!adapterConfig) throw new Error(`Unknown adapter: ${adapter}`);

  const schemas = ACTION_SCHEMAS[adapter as keyof typeof ACTION_SCHEMAS];
  if (!schemas) throw new Error(`Unknown adapter: ${adapter}`);

  const schema = (schemas as Record<string, z.ZodType>)[action];
  if (!schema) throw new Error(`Unknown action ${action} for adapter ${adapter}`);

  const validated = schema.parse(params) as Record<string, unknown>;

  const encodedCalldata = encodeFunctionData({
    abi: adapterConfig.abi,
    functionName: action,
    args: buildArgs(adapter, action, validated),
  });

  return { adapterAddress: adapterConfig.address, encodedCalldata };
}

export type DecodedAdapterCall = {
  adapterName: string;
  adapterKey: string;
  action: string;
  params: Record<string, unknown>;
};

export function decodeAdapterCall(
  adapterAddress: string,
  calldata: `0x${string}`,
): DecodedAdapterCall | null {
  const adapterKey = ADAPTER_BY_ADDRESS[adapterAddress.toLowerCase()];
  if (!adapterKey) return null;

  const adapterConfig = ADAPTERS[adapterKey];
  try {
    const decoded = decodeFunctionData({ abi: adapterConfig.abi, data: calldata });
    return {
      adapterName: adapterConfig.name,
      adapterKey,
      action: decoded.functionName,
      params: argsToParams(adapterKey, decoded.functionName, decoded.args as readonly unknown[]),
    };
  } catch {
    return null;
  }
}

export function formatAdapterAction(
  adapterName: string,
  action: string,
  params: Record<string, unknown>,
): string {
  if (adapterName === "UniswapV3Adapter") {
    if (action === "swapExactInputSingle" || action === "swapExactInput") {
      const tokenIn = tokenSymbol(params.tokenIn as string);
      const tokenOut = tokenSymbol(params.tokenOut as string);
      const amountIn = formatTokenAmount(params.amountIn as string, params.tokenIn as string);
      return `Uniswap: swap ${amountIn} ${tokenIn} → ${tokenOut}`;
    }
  }
  if (adapterName === "AaveV3Adapter") {
    const token = tokenSymbol(params.token as string);
    const amount = formatTokenAmount(params.amount as string, params.token as string);
    if (action === "supply") return `Aave: supply ${amount} ${token}`;
    if (action === "withdraw") return `Aave: withdraw ${amount} ${token}`;
    if (action === "borrow") return `Aave: borrow ${amount} ${token}`;
    if (action === "repay") return `Aave: repay ${amount} ${token}`;
  }
  return `${adapterName}: ${action}`;
}
