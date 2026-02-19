import type { Fund, FundTerms, FundStats, FundsListResponse } from '@/types/fund';
import type { ClaimStatus, ClaimRequest, ClaimSuccess } from '@/types/claim';
import type { HealthResponse } from '@/types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/** Generic fetch wrapper with typed responses */
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/** GET /funds — homepage fund card grid */
export async function fetchFunds(): Promise<Fund[]> {
  const data = await fetchApi<FundsListResponse>('/funds');
  return data.funds;
}

/** GET /funds/{vaultAddress}/terms — fund detail terms */
export async function fetchFundTerms(vaultAddress: string): Promise<FundTerms> {
  return fetchApi<FundTerms>(`/funds/${vaultAddress}/terms`);
}

/** GET /funds/{vaultAddress}/stats — fund detail metrics */
export async function fetchFundStats(vaultAddress: string): Promise<FundStats> {
  return fetchApi<FundStats>(`/funds/${vaultAddress}/stats`);
}

/** GET /funds/{vaultAddress}/activity — pre-formatted activity log lines */
export async function fetchFundActivity(vaultAddress: string): Promise<{
  lines: Array<{ line1: string; line2: string | null; timestamp: number; blockNumber: number }>;
}> {
  return fetchApi(`/funds/${vaultAddress}/activity`);
}

/** GET /health — hero status block */
export async function fetchHealth(): Promise<HealthResponse> {
  return fetchApi<HealthResponse>('/health');
}

/** GET /stats — public metrics for hero */
export async function fetchStats(): Promise<{ apiKeyCount: number; fundCount: number }> {
  return fetchApi<{ apiKeyCount: number; fundCount: number }>('/stats');
}

/** GET /auth/claim-status?token=... — claim page registration details */
export async function fetchClaimStatus(token: string): Promise<ClaimStatus> {
  return fetchApi<ClaimStatus>(`/auth/claim-status?token=${encodeURIComponent(token)}`);
}

/** POST /auth/claim — claim page verification + key generation */
export async function submitClaim(request: ClaimRequest): Promise<ClaimSuccess> {
  return fetchApi<ClaimSuccess>('/auth/claim', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
