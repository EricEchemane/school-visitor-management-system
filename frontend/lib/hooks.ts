'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export const POLL_MS = 5000;

/** Fetch now and then every few seconds. Swapping to push updates would only touch this hook. */
export function usePolling<T>(fetcher: () => Promise<T>, ms = POLL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(fetcher);
  useEffect(() => {
    ref.current = fetcher;
  });

  const reload = useCallback(async () => {
    try {
      setData(await ref.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, ms);
    return () => clearInterval(id);
  }, [reload, ms]);

  return { data, error, reload };
}
