'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchFundStats } from '@/lib/api';
import type { FundStats } from '@/types/fund';

export function useFundStats(vaultAddress: string) {
  const [data, setData] = useState<FundStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchFundStats(vaultAddress)
      .then((stats) => {
        if (!cancelled) {
          setData(stats);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load fund stats');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [vaultAddress]);

  const refetch = useCallback(() => {
    fetchFundStats(vaultAddress)
      .then((stats) => setData(stats))
      .catch(() => {});
  }, [vaultAddress]);

  return { data, loading, error, refetch };
}
