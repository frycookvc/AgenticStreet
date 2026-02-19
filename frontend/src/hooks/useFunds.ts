'use client';

import { useState, useEffect } from 'react';
import { fetchFunds } from '@/lib/api';
import type { Fund } from '@/types/fund';

export function useFunds() {
  const [data, setData] = useState<Fund[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchFunds()
      .then((funds) => {
        if (!cancelled) {
          setData(funds);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load funds');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
