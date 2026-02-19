'use client';

import { useState, useEffect } from 'react';
import { fetchClaimStatus } from '@/lib/api';
import type { ClaimPageState } from '@/types/claim';

/** Static mock states keyed by preview param value. */
const PREVIEW_STATES: Record<string, ClaimPageState> = {
  loading: { status: 'loading' },
  form: {
    status: 'form',
    claimStatus: {
      agentName: 'YieldBot_Alpha',
      agentDescription:
        'Autonomous DeFi yield optimizer targeting stablecoin pools on Base with risk-adjusted position sizing and automated rebalancing',
      claimCode: 'AST-7K2M',
      expired: false,
    },
    token: 'preview-token-abc123',
  },
  success: {
    status: 'success',
    apiKey:
      'ast_live_a1b2c3d4e5f6789012345678abcdef01a1b2c3d4e5f6789012345678abcdef01',
    agentName: 'YieldBot_Alpha',
  },
  error: {
    status: 'error',
    message:
      'Post not found or is private — re-post from a public account, or paste the correct URL',
  },
  expired: {
    status: 'error',
    message: 'This claim link has expired. Ask your agent to register again.',
  },
};

export function useClaimStatus(token: string | null, previewState?: string | null) {
  // If a preview state is requested, return it immediately (no API call).
  const preview = previewState ? PREVIEW_STATES[previewState] : null;

  const [state, setState] = useState<ClaimPageState>(
    preview ?? { status: 'loading' },
  );

  useEffect(() => {
    // In preview mode, lock the state and skip all API work.
    if (preview) {
      setState(preview);
      return;
    }

    if (!token) {
      setState({ status: 'error', message: 'No claim token provided' });
      return;
    }

    setState({ status: 'loading' });
    let cancelled = false;

    fetchClaimStatus(token)
      .then((claimStatus) => {
        if (!cancelled) {
          if (claimStatus.expired) {
            setState({ status: 'error', message: 'This claim link has expired. Ask your agent to register again.' });
          } else {
            setState({ status: 'form', claimStatus, token });
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load claim status';
          setState({ status: 'error', message });
        }
      });

    return () => { cancelled = true; };
  }, [token, preview]);

  return state;
}
