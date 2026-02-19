import { z } from "zod";
import { encodeFunctionData, isAddress } from "viem";
import { FundFactoryABI, FACTORY_ADDRESS, CHAIN_ID } from "../config.js";
import { type TxData, parseUint256 } from "./types.js";

export const createFundSchema = {
  managerAddress: z.string().describe("Manager wallet address (expected msg.sender)"),
  minRaise: z.string().describe("Minimum raise amount in USDC base units (uint256)"),
  maxRaise: z.string().describe("Maximum raise amount in USDC base units (uint256)"),
  managementFeeBps: z.number().describe("Management fee in basis points (e.g. 200 = 2%)"),
  performanceFeeBps: z.number().describe("Performance fee in basis points (e.g. 2000 = 20%)"),
  fundDuration: z.string().describe("Fund duration in seconds (uint256)"),
  depositWindow: z.string().describe("Deposit window duration in seconds (uint256)"),
  metadataURI: z.string().describe("IPFS metadata URI from pin_metadata (e.g. ipfs://Qm...)"),
};

export type CreateFundInput = {
  managerAddress: string;
  minRaise: string;
  maxRaise: string;
  managementFeeBps: number;
  performanceFeeBps: number;
  fundDuration: string;
  depositWindow: string;
  metadataURI: string;
};

/**
 * Encodes calldata for FundFactory.createFund().
 * The factory uses msg.sender as the manager, so managerAddress is validated
 * but not passed to the contract — it is the expected signer.
 */
const USDC_DECIMALS = 6n;
const ONE_USDC = 10n ** USDC_DECIMALS; // 1000000

function validateUsdcAmount(value: bigint, fieldName: string): void {
  if (value < ONE_USDC) {
    throw new Error(
      `${fieldName} is ${value} — that's less than 1 USDC. ` +
      `USDC uses 6 decimals: 1 USDC = 1000000, 5 USDC = 5000000, 1000 USDC = 1000000000. ` +
      `If your human said "${fieldName} = ${value} USDC", send "${value}000000".`
    );
  }
  if (value > 100_000n * ONE_USDC) {
    throw new Error(
      `${fieldName} is ${value} (${Number(value / ONE_USDC).toLocaleString()} USDC) — exceeds the 100,000 USDC fund size cap. ` +
      `Did you accidentally use 18 decimals instead of 6? USDC uses 6 decimals, not 18.`
    );
  }
}

export function createFundHandler(input: CreateFundInput): TxData {
  if (!isAddress(input.managerAddress)) {
    throw new Error(`Invalid managerAddress: ${input.managerAddress}`);
  }

  const minRaise = parseUint256(input.minRaise, "minRaise");
  const maxRaise = parseUint256(input.maxRaise, "maxRaise");
  validateUsdcAmount(minRaise, "minRaise");
  validateUsdcAmount(maxRaise, "maxRaise");

  const data = encodeFunctionData({
    abi: FundFactoryABI,
    functionName: "createFund",
    args: [
      {
        minRaise: parseUint256(input.minRaise, "minRaise"),
        maxRaise: parseUint256(input.maxRaise, "maxRaise"),
        managementFeeBps: input.managementFeeBps,
        performanceFeeBps: input.performanceFeeBps,
        fundDuration: parseUint256(input.fundDuration, "fundDuration"),
        depositWindow: parseUint256(input.depositWindow, "depositWindow"),
        metadataURI: input.metadataURI,
      },
    ],
  });

  return {
    to: FACTORY_ADDRESS,
    data,
    value: "0",
    chainId: CHAIN_ID,
  };
}
