"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveChainConfig } from '@/lib/chain-selection';
import { initialResult, readQuery, type QueryResult } from '@/lib/query-result';
import { createQueryClient, type QueryClient } from '@/services/clients';
import type { ChainConfig } from '@/lib/env';

export function useQuery<T>(target: string, load: (client: QueryClient, previous: T | null) => Promise<T>, pollMs?: number, enabled = true, pinnedChain?: ChainConfig) {
  const [, chainChanged] = useState(0);
  const chain = pinnedChain ?? getActiveChainConfig();
  const key = JSON.stringify([chain.key, target]);
  const context = { chain: chain.key, target };
  const [result, setResult] = useState<QueryResult<T>>(() => initialResult(context));
  const [busy, setBusy] = useState(false);
  const state = useRef(result);
  const loader = useRef(load);
  loader.current = load;
  const currentKey = useRef(key);
  currentKey.current = key;
  const active = useRef<{ key: string; controller: AbortController } | null>(null);
  const chainRef = useRef(chain);
  chainRef.current = chain;
  const pinned = useRef(!!pinnedChain);
  pinned.current = !!pinnedChain;

  const refresh = useCallback(async () => {
    if (!enabled || active.current?.key === key) return;
    const previous = state.current.context.chain === chainRef.current.key && state.current.context.target === target ? state.current : undefined;
    if (previous?.error?.retryAt && previous.error.retryAt > Date.now()) return;
    active.current?.controller.abort();
    const controller = new AbortController();
    active.current = { key, controller };
    const nextContext = { chain: chainRef.current.key, target };
    setBusy(true);
    setResult({ ...(previous ?? initialResult<T>(nextContext)), status: 'loading' });
    const next = await readQuery(nextContext, () => loader.current(createQueryClient(chainRef.current, controller.signal), previous?.data ?? null), previous);
    if (controller.signal.aborted || currentKey.current !== key) return;
    state.current = next;
    active.current = null;
    setResult(next);
    setBusy(false);
  }, [key, target, enabled]);

  useEffect(() => {
    const change = () => {
      if (pinned.current) return;
      // Initial cookie hydration may announce the already selected default chain.
      if (getActiveChainConfig().key === chainRef.current.key) return;
      active.current?.controller.abort();
      active.current = null;
      chainChanged(n => n + 1);
    };
    window.addEventListener('explorer:chain-changed', change);
    return () => window.removeEventListener('explorer:chain-changed', change);
  }, []);
  useEffect(() => {
    const invalidate = (event: Event) => {
      const detail = (event as CustomEvent<{ chain: string; targets: string[] }>).detail;
      if (detail.chain !== chainRef.current.key || !detail.targets.includes(target)) return;
      active.current?.controller.abort(); active.current = null;
      // Explicit transaction invalidation must not reuse a pre-inclusion response.
      state.current = initialResult({ chain: chainRef.current.key, target });
      void refresh();
    };
    window.addEventListener('explorer:queries-invalidated', invalidate);
    return () => window.removeEventListener('explorer:queries-invalidated', invalidate);
  }, [refresh, target]);
  useEffect(() => {
    void refresh();
    const interval = pollMs ? window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, pollMs) : undefined;
    return () => {
      active.current?.controller.abort();
      active.current = null;
      if (interval) window.clearInterval(interval);
    };
  }, [refresh, pollMs]);
  const visible = enabled && result.context.chain === context.chain && result.context.target === target ? result : initialResult<T>(context);
  return { result: visible, refresh, busy: enabled && (busy || visible.status === 'idle') };
}
