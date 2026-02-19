import { z } from "zod";
import { getPinataJwt, ERC8004_IDENTITY_REGISTRY, ERC8004_IDENTITY_ABI, CHAIN_ID } from "../config.js";
import { getPublicClient } from "../viem.js";
import { preCacheMetadata } from "../resources/utils.js";
import { logger } from "../logger.js";

export const pinMetadataSchema = {
  name: z.string().describe("Fund name"),
  description: z.string().describe("Fund description"),
  managerName: z.string().describe("Name of the fund manager"),
  managerDescription: z.string().describe("Description of the fund manager"),
  strategyType: z.string().describe("Investment strategy type"),
  riskLevel: z.string().describe("Risk level (e.g. low, medium, high)"),
  expectedDuration: z.string().describe("Expected fund duration as human-readable string"),
  minRaise: z.string().optional().describe("Minimum raise amount in USDC base units (6 decimals)"),
  maxRaise: z.string().optional().describe("Maximum raise amount in USDC base units (6 decimals)"),
  managementFeeBps: z.number().optional().describe("Management fee in basis points"),
  performanceFeeBps: z.number().optional().describe("Performance fee in basis points"),
  fundDuration: z.number().optional().describe("Fund duration in seconds"),
  depositWindow: z.number().optional().describe("Deposit window duration in seconds"),
  managerAddress: z.string().optional().describe("Manager wallet address (required for ERC-8004 verification)"),
  erc8004AgentId: z.number().int().positive().optional().describe("ERC-8004 agent ID for identity verification"),
  erc8004RegistryChain: z.string().optional().describe(`CAIP-2 chain identifier (defaults to eip155:${CHAIN_ID})`),
};

export interface PinMetadataInput {
  name: string;
  description: string;
  managerName: string;
  managerDescription: string;
  strategyType: string;
  riskLevel: string;
  expectedDuration: string;
  minRaise?: string;
  maxRaise?: string;
  managementFeeBps?: number;
  performanceFeeBps?: number;
  fundDuration?: number;
  depositWindow?: number;
  managerAddress?: string;
  erc8004AgentId?: number;
  erc8004RegistryChain?: string;
}

const REQUIRED_FIELDS: (keyof PinMetadataInput)[] = [
  "name",
  "description",
  "managerName",
  "managerDescription",
  "strategyType",
  "riskLevel",
  "expectedDuration",
];

async function verifyErc8004(agentId: number, managerAddress: string): Promise<boolean> {
  try {
    const client = getPublicClient();
    const normalised = managerAddress.toLowerCase();

    const owner = await client.readContract({
      address: ERC8004_IDENTITY_REGISTRY as `0x${string}`,
      abi: ERC8004_IDENTITY_ABI,
      functionName: "ownerOf",
      args: [BigInt(agentId)],
    });
    if ((owner as string).toLowerCase() === normalised) return true;

    const agentWallet = await client.readContract({
      address: ERC8004_IDENTITY_REGISTRY as `0x${string}`,
      abi: ERC8004_IDENTITY_ABI,
      functionName: "getAgentWallet",
      args: [BigInt(agentId)],
    });
    if ((agentWallet as string).toLowerCase() === normalised) return true;

    logger.warn({ event: "erc8004_verify_no_match", agentId, managerAddress, owner, agentWallet });
    return false;
  } catch (error) {
    logger.error({ event: "erc8004_verify_error", agentId, managerAddress, error: (error as Error).message });
    return false;
  }
}

export async function pinMetadataHandler(
  input: PinMetadataInput
): Promise<{ metadataURI: string }> {
  // Validate all required fields are non-empty strings
  for (const field of REQUIRED_FIELDS) {
    const value = input[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Missing or empty required field: ${field}`);
    }
  }

  const metadata: Record<string, unknown> = {
    version: "1.0",
    pinnedAt: new Date().toISOString(),
    name: input.name,
    description: input.description,
    managerName: input.managerName,
    managerDescription: input.managerDescription,
    strategyType: input.strategyType,
    riskLevel: input.riskLevel,
    expectedDuration: input.expectedDuration,
  };

  // Include optional financial fields if provided
  if (input.minRaise) metadata.minRaise = input.minRaise;
  if (input.maxRaise) metadata.maxRaise = input.maxRaise;
  if (input.managementFeeBps !== undefined) metadata.managementFeeBps = input.managementFeeBps;
  if (input.performanceFeeBps !== undefined) metadata.performanceFeeBps = input.performanceFeeBps;
  if (input.fundDuration !== undefined) metadata.fundDuration = input.fundDuration;
  if (input.depositWindow !== undefined) metadata.depositWindow = input.depositWindow;

  // ERC-8004 identity verification (optional)
  if (input.erc8004AgentId !== undefined && input.managerAddress) {
    const isVerified = await verifyErc8004(input.erc8004AgentId, input.managerAddress);
    if (isVerified) {
      metadata.erc8004 = {
        agentId: input.erc8004AgentId,
        registryChain: input.erc8004RegistryChain ?? `eip155:${CHAIN_ID}`,
        registryAddress: ERC8004_IDENTITY_REGISTRY,
        verified: true,
        verifiedAt: new Date().toISOString(),
      };
    }
    // If not verified: silently skip — metadata pins without erc8004 block
  }

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getPinataJwt()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pinataContent: metadata }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "unknown");
    logger.error({ event: "pinata_error", status: response.status, body });
    throw new Error(`Metadata pinning failed (HTTP ${response.status})`);
  }

  const data = (await response.json()) as { IpfsHash: string };

  if (!data.IpfsHash) {
    throw new Error("Pinata response missing IpfsHash");
  }

  const metadataURI = `ipfs://${data.IpfsHash}`;

  // Pre-populate cache so immediate reads don't need a gateway fetch
  preCacheMetadata(metadataURI, metadata);

  return { metadataURI };
}
