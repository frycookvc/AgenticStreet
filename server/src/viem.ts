import { createPublicClient, http, ContractFunctionExecutionError } from "viem";
import { base, baseSepolia } from "viem/chains";
import { getBaseRpcUrl, CHAIN_ID } from "./config.js";
import { logger } from "./logger.js";

/**
 * Lazy singleton public client for Base.
 * All contract reads and event queries use this client.
 * Must be called after validateEnv().
 */
// biome-ignore lint: viem's PublicClient type is complex with chain generics
let client: any = null;

export function getPublicClient() {
  if (!client) {
    client = createPublicClient({
      chain: CHAIN_ID === 84532 ? baseSepolia : base,
      transport: http(getBaseRpcUrl()),
    });
  }
  return client;
}

/**
 * Wrapper around readContract with retry logic for eventual consistency.
 *
 * RPC providers can return "0x" for valid contracts due to load-balanced nodes
 * being slightly behind. This function detects zero-data errors and retries
 * with exponential backoff. Contract addresses come from indexed events and
 * are guaranteed to exist.
 *
 * Non-zero-data errors (network, reverts, etc.) are thrown immediately.
 */
export async function readContractWithRetry(params: any): Promise<any> {
  const client = getPublicClient();
  const delays = [500, 1000, 2000];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await client.readContract(params);
    } catch (error) {
      lastError = error as Error;

      // Check if this is a zero-data error (string-based detection tied to viem's error format)
      const isZeroDataError =
        error instanceof ContractFunctionExecutionError &&
        (error.message.includes('returned no data ("0x")') ||
         error.shortMessage?.includes('returned no data ("0x")'));

      if (!isZeroDataError) {
        // Not a zero-data error — throw immediately
        throw error;
      }

      // Zero-data error — retry with delay
      if (attempt < delays.length) {
        const delay = delays[attempt];
        logger.warn({ event: "viem_retry", functionName: params.functionName, address: params.address, attempt: attempt + 1, delayMs: delay });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  throw lastError;
}
