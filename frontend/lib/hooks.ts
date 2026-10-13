'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from './api';

export const POLL_MS = 5000;

/** Connection health as seen by polling: shared so one banner can speak for every poll on the page. */
export type Connection = 'ok' | 'offline' | 'signed-out';
let connection: Connection = 'ok';
const listeners = new Set<() => void>();
/** Called after signing in, so a stale "signed-out" from the last session does not linger. */
export const resetConnection = () => setConnection('ok');
function setConnection(next: Connection) {
  if (next === connection) return;
  connection = next;
  listeners.forEach((l) => l());
}
export function useConnection(): Connection {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => connection,
    () => 'ok',
  );
}

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
      setConnection('ok');
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError) {
        if (e.status === 401) setConnection('signed-out');
        else if (e.status >= 500) setConnection('offline'); // the proxy answers 5xx when the API is down
      } else {
        setConnection('offline'); // fetch itself failed: network or server down
      }
    }
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, ms);
    return () => clearInterval(id);
  }, [reload, ms]);

  return { data, error, reload };
}

/**
 * Tracks one in-flight action. `run` ignores calls while one is pending, so a double click
 * cannot send the same request twice.
 */
export function usePending<K = true>() {
  const [pending, setPending] = useState<K | null>(null);
  const busy = useRef(false);
  const run = useCallback(async (key: K, fn: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(key);
    try {
      await fn();
    } finally {
      busy.current = false;
      setPending(null);
    }
  }, []);
  return { pending, run };
}
