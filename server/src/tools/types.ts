export type TxData = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string; // bigint serialized as string (JSON can't represent bigint)
  chainId: number;
};

/**
 * Parse a string as a non-negative uint256.
 * Provides descriptive error messages for AI agent callers.
 */
export function parseUint256(value: string, fieldName: string): bigint {
  let n: bigint;
  try {
    n = BigInt(value);
  } catch {
    throw new Error(`Invalid ${fieldName}: "${value}" is not a valid integer`);
  }
  if (n < 0n) {
    throw new Error(`Invalid ${fieldName}: must be non-negative`);
  }
  return n;
}
