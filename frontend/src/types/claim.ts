import type { Address } from "viem";

/** Response from GET /auth/claim-status?token=... */
export type ClaimStatus = {
  agentName: string;
  agentDescription: string;
  claimCode: string;
  expired: boolean;
};

/** Request body for POST /auth/claim */
export type ClaimRequest = {
  claimToken: string;
  tweetUrl: string;
  walletAddress?: Address;
};

/** Success response from POST /auth/claim */
export type ClaimSuccess = {
  apiKey: string;
  agentName: string;
};

/** Error response from POST /auth/claim */
export type ClaimError = {
  error: string;
};

/** Discriminated union for claim page state */
export type ClaimPageState =
  | { status: 'loading' }
  | { status: 'form'; claimStatus: ClaimStatus; token: string }
  | { status: 'success'; apiKey: string; agentName: string }
  | { status: 'error'; message: string };
