"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveChainConfig } from '@/lib/chain-selection';
import { initialResult, readQuery } from '@/lib/query-result';
import { createQueryClient, type QueryClient } from '@/services/clients';
import type { ChainConfig } from '@/lib/env';

export function useQuery<T>(target: string, load: (client: QueryClient, previous: T | null) => Promise<T>, pollMs?: number, enabled = true, pinnedChain?: ChainConfig) {
  const [, chainChanged] = useState(0);
  const chain = pinnedChain ?? getActiveChainConfig();
  const key = JSON.stringify([chain.key, target]);
  const [view, setView] = useState(() => ({ result: initialResult<T>({ chain: chain.key, target }), busy: false, paused: false, recovered: false, unchanged: false }));
  const retained = useRef(view.result);
  const loader = useRef(load);
  loader.current = load;
  const chainRef = useRef(chain);
  chainRef.current = chain;
  const currentKey = useRef(key);
  currentKey.current = key;
  const pinned = useRef(!!pinnedChain);
  pinned.current = !!pinnedChain;
  const runtime = useRef<{ refresh: () => Promise<void>; cancel: () => void } | null>(null);
  const refresh = useCallback(async () => { await runtime.current?.refresh(); }, []);

  useEffect(() => {
    const change = () => {
      if (pinned.current) return;
      try { if (getActiveChainConfig().key === chainRef.current.key) return; }
      catch { runtime.current?.cancel(); return; }
      runtime.current?.cancel();
      chainChanged(n => n + 1);
    };
    window.addEventListener('explorer:chain-changed', change);
    return () => window.removeEventListener('explorer:chain-changed', change);
  }, []);

  useEffect(() => {
    const context = { chain: chainRef.current.key, target };
    const selectedChain = chainRef.current;
    let result = retained.current.context.chain === context.chain && retained.current.context.target === target ? retained.current : initialResult<T>(context);
    let disposed = false, paused = !!pollMs && document.visibilityState === 'hidden';
    let active: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let version = 0;
    let failures = 0, queued = false, recovered = false, unchanged = false;
    const publish = () => {
      if (!disposed && currentKey.current === key) setView({ result, busy: !!active && !paused, paused, recovered, unchanged });
    };
    const clearTimer = () => { clearTimeout(timer); timer = undefined; };
    const schedule = (delay: number) => {
      clearTimer();
      if (!disposed && enabled && !paused) timer = setTimeout(() => void run(), Math.max(0, delay));
    };
    const run = async () => {
      if (disposed || !enabled || paused || active) return;
      const wait = (result.error?.retryAt ?? 0) - Date.now();
      if (wait > 0) { if (pollMs) schedule(wait); return; }
      clearTimer();
      queued = false;
      const previous = result;
      const startedVersion = version;
      const controller = new AbortController();
      active = controller;
      // Preserve the stale/error indication while retrying existing data.
      if (!pollMs || !previous.error) result = { ...previous, status: 'loading' };
      publish();
      const client = createQueryClient(selectedChain, controller.signal);
      const next = await readQuery(context, () => loader.current(client, previous.data), previous);
      if (['success', 'empty', 'partial', 'not-found'].includes(next.status)) next.observations = client.observations;
      active = null;
      if (disposed || currentKey.current !== key) return;
      if (!controller.signal.aborted) {
        if (next.error && next.error.kind !== 'cancelled') {
          failures++;
          if (pollMs) next.error = { ...next.error, retryAt: next.error.retryAt && next.error.retryAt > Date.now() ? next.error.retryAt : Date.now() + [3000, 6000, 12000, 30000][Math.min(failures - 1, 3)] };
        } else if (!next.error) {
          recovered = failures > 0;
          unchanged = !!next.blockHeight && next.blockHeight === previous.blockHeight;
          failures = 0;
        }
        result = next;
        retained.current = next;
      } else if (version === startedVersion) result = previous;
      publish();
      if (queued) { void run(); return; }
      if (pollMs) schedule(Math.max(0, (result.error?.retryAt ?? Date.now() + pollMs) - Date.now()));
    };
    const cancel = () => { clearTimer(); active?.abort(); };
    const control = { refresh: run, cancel };
    runtime.current = control;
    const visibility = () => {
      const hidden = document.visibilityState === 'hidden';
      if (hidden === paused) return;
      paused = hidden;
      if (hidden) { queued = false; cancel(); }
      else { queued = true; void run(); }
      publish();
    };
    const invalidate = (event: Event) => {
      const detail = (event as CustomEvent<{ chain: string; targets: string[] }>).detail;
      if (detail.chain !== context.chain || !detail.targets.includes(target)) return;
      cancel();
      version++;
      // Wait for the cancelled cycle to settle; coalesce repeated invalidations.
      // Keep any Retry-After deadline, but discard pre-inclusion data.
      result = { ...initialResult<T>(context), error: result.error };
      retained.current = result;
      queued = true;
      publish();
      void run();
    };
    if (pollMs) document.addEventListener('visibilitychange', visibility);
    window.addEventListener('explorer:queries-invalidated', invalidate);
    publish();
    void run();
    return () => {
      disposed = true;
      cancel();
      if (runtime.current === control) runtime.current = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('explorer:queries-invalidated', invalidate);
    };
  }, [key, target, enabled, pollMs]);
  const matches = enabled && view.result.context.chain === chain.key && view.result.context.target === target;
  const result = matches ? view.result : initialResult<T>({ chain: chain.key, target });
  return { result, refresh, busy: enabled && !view.paused && (matches ? view.busy || result.status === 'idle' : true), paused: matches && view.paused, recovered: matches && view.recovered, unchanged: matches && view.unchanged };
}
