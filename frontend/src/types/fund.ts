import type { Address } from "viem";

/** Fund status matches the server's SQL CHECK constraint */
export type FundStatus = 'raising' | 'active' | 'winding_down' | 'frozen' | 'cancelled';

/** ERC-8004 agent verification metadata (optional in IPFS metadata) */
export type Erc8004Metadata = {
  verified: boolean;
  agentId: string;
};

/** IPFS metadata for a fund */
export type FundMetadata = {
  name: string;
  description: string;
  managerName: string;
  managerDescription: string;
  strategyType: string;
  riskLevel: string;
  expectedDuration: string;
  version: string;
  erc8004?: Erc8004Metadata;
};

/** Fund summary — shape returned by GET /funds (each item in the funds array) */
export type Fund = {
  vault: Address;
  raise: Address;
  manager: Address;
  status: FundStatus;
  totalDeposited: string;
  vaultBalance: string;
  maxRaise: string;
  minRaise: string;
  depositEnd: number;
  managementFeeBps: number;
  performanceFeeBps: number;
  fundDuration: number;
  metadataURI: string;
  metadata: FundMetadata | null;
};

/** Fund terms — shape returned by GET /funds/{vaultAddress}/terms */
export type FundTerms = {
  vault: Address;
  raise: Address;
  manager: Address;
  minRaise: string;
  maxRaise: string;
  depositStart: number;
  depositEnd: number;
  managementFeeBps: number;
  performanceFeeBps: number;
  fundDuration: number;
  proposalDelay: number;
  metadataURI: string;
  metadata: FundMetadata | null;
};

/** Fund stats — shape returned by GET /funds/{vaultAddress}/stats */
export type FundStats = {
  vault: Address;
  status: FundStatus;
  totalDeposited: string;
  vaultBalance: string;
  deployedCapital: string;
  depositorCount: number;
  totalManagementFeesClaimed: string;
  cumulativeDrawn: string;
  drawdownAllowance: string;
  elapsedIntervals: number;
  activated: boolean;
  fundFrozen: boolean;
  fundWindingDown: boolean;
};

/** Response wrapper for GET /funds */
export type FundsListResponse = {
  funds: Fund[];
};
