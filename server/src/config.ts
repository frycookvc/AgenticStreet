import FundFactoryABI from "./abis/FundFactory.json" with { type: "json" };
import FundRaiseABI from "./abis/FundRaise.json" with { type: "json" };
import FundVaultABI from "./abis/FundVault.json" with { type: "json" };
import ERC20ABI from "./abis/ERC20.json" with { type: "json" };
import UniswapV3AdapterABI from "./abis/UniswapV3Adapter.json" with { type: "json" };
import AaveV3AdapterABI from "./abis/AaveV3Adapter.json" with { type: "json" };

// Re-export ABIs
export { FundFactoryABI, FundRaiseABI, FundVaultABI, ERC20ABI, UniswapV3AdapterABI, AaveV3AdapterABI };

// Core deployment addresses — all from env
export const CHAIN_ID = Number(process.env.CHAIN_ID ?? 8453);
export const FACTORY_ADDRESS = (process.env.FACTORY_ADDRESS ?? "") as `0x${string}`;
export const USDC_ADDRESS = (process.env.USDC_ADDRESS ?? "") as `0x${string}`;
export const START_BLOCK = BigInt(process.env.START_BLOCK ?? "0");

// Adapter registry
export const ADAPTERS = {
  uniswap_v3: {
    address: (process.env.UNISWAP_ADAPTER ?? "") as `0x${string}`,
    name: "UniswapV3Adapter",
    abi: UniswapV3AdapterABI,
  },
  aave_v3: {
    address: (process.env.AAVE_ADAPTER ?? "") as `0x${string}`,
    name: "AaveV3Adapter",
    abi: AaveV3AdapterABI,
  },
} as const;

export const ADAPTER_BY_ADDRESS: Record<string, keyof typeof ADAPTERS> = Object.fromEntries(
  Object.entries(ADAPTERS).map(([key, val]) => [val.address.toLowerCase(), key])
) as Record<string, keyof typeof ADAPTERS>;

// Token metadata for human-readable formatting (keys lowercase for case-insensitive lookup)
export const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [USDC_ADDRESS.toLowerCase()]: { symbol: "USDC", decimals: 6 },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
};

export function tokenSymbol(address: string): string {
  return TOKENS[address.toLowerCase()]?.symbol ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTokenAmount(amount: bigint | string, address: string): string {
  const decimals = TOKENS[address.toLowerCase()]?.decimals ?? 18;
  const num = Number(BigInt(amount)) / 10 ** decimals;
  return num.toLocaleString("en-US", { maximumFractionDigits: decimals > 6 ? 4 : 2 });
}

// SSE configuration
export const SSE_HEARTBEAT_MS = 15_000;
export const SSE_REPLAY_WINDOW_MS = 10 * 60 * 1000;
export const SSE_MAX_PER_KEY = 3;

// Server configuration
export const PORT = Number(process.env.PORT ?? 3001);
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15000);
export const WEBHOOK_RETRY_INTERVAL_MS = Number(process.env.WEBHOOK_RETRY_INTERVAL_MS ?? 60000);
export const DB_PATH = process.env.DB_PATH ?? "./data/agentic-street.db";

let validated = false;

/**
 * Validates that all required environment variables are set.
 * Throws on missing required variables.
 * Call this at startup before using any env-dependent config.
 */
export function validateEnv(): void {
  const required = {
    PINATA_JWT: process.env.PINATA_JWT,
    ADMIN_API_KEY: process.env.ADMIN_API_KEY,
    BASE_RPC_URL: process.env.BASE_RPC_URL,
    FACTORY_ADDRESS: process.env.FACTORY_ADDRESS,
    USDC_ADDRESS: process.env.USDC_ADDRESS,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  validated = true;
}

function requireValidated(name: string): void {
  if (!validated) {
    throw new Error(
      `Cannot read ${name} before validateEnv() has been called`
    );
  }
}

// Safe getters (require validateEnv() to be called first)
export function getPinataJwt(): string {
  requireValidated("PINATA_JWT");
  return process.env.PINATA_JWT ?? "";
}

export function getAdminApiKey(): string {
  requireValidated("ADMIN_API_KEY");
  return process.env.ADMIN_API_KEY ?? "";
}

export function getBaseRpcUrl(): string {
  requireValidated("BASE_RPC_URL");
  return process.env.BASE_RPC_URL ?? "";
}

// ERC-8004 Identity Registry (Base)
export const ERC8004_IDENTITY_REGISTRY =
  process.env.ERC8004_IDENTITY_REGISTRY ??
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

export const ERC8004_IDENTITY_ABI = [
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentWallet",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;
