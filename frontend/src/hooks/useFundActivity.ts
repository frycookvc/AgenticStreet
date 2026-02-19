'use client';

import { useState, useEffect } from 'react';
import { fetchFundActivity } from '@/lib/api';

export interface ActivityLine {
  line1: string;
  line2: string | null;
  timestamp: number;
  blockNumber: number;
}

export function useFundActivity(vaultAddress: string) {
  const [data, setData] = useState<ActivityLine[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchFundActivity(vaultAddress)
      .then((res) => {
        if (!cancelled) {
          setData(res.lines);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData([]);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [vaultAddress]);

  return { data, loading };
}
