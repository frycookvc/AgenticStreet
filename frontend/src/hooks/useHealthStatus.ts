'use client';

import { useState, useEffect } from 'react';
import { fetchHealth } from '@/lib/api';
import type { HealthResponse } from '@/types/api';

export function useHealthStatus() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchHealth()
      .then((health) => {
        if (!cancelled) {
          setData(health);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load health');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
