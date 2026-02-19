'use client';

import { useState, useEffect } from 'react';
import { fetchFundTerms } from '@/lib/api';
import type { FundTerms } from '@/types/fund';

export function useFundTerms(vaultAddress: string) {
  const [data, setData] = useState<FundTerms | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchFundTerms(vaultAddress)
      .then((terms) => {
        if (!cancelled) {
          setData(terms);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load fund terms');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [vaultAddress]);

  return { data, loading, error };
}
