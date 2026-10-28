"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveChainConfig } from '@/lib/chain-selection';
import { initialResult, QueryError, readQuery } from '@/lib/query-result';
import { invalidateQueryReads, queryIdentity, createQueryClient, type QueryClient } from '@/services/clients';
import type { ChainConfig } from '@/lib/env';

export function useQuery<T>(target: string, load: (client: QueryClient, previous: T | null) => Promise<T>, pollMs?: number, enabled = true, pinnedChain?: ChainConfig) {
  const [, chainChanged] = useState(0);
  const chain = pinnedChain ?? getActiveChainConfig();
  const key = JSON.stringify([queryIdentity(chain), target]);
  const [view, setView] = useState(() => ({ key, result: initialResult<T>({ chain: chain.key, target }), busy: false, paused: false, recovered: false, unchanged: false }));
  const retained = useRef(view.result);
  const retainedKey = useRef(key);
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
      try { if (queryIdentity(getActiveChainConfig()) === queryIdentity(chainRef.current)) return; }
      catch { runtime.current?.cancel(); return; }
      runtime.current?.cancel();
      chainChanged(n => n + 1);
    };
    window.addEventListener('explorer:chain-changed', change);
    return () => window.removeEventListener('explorer:chain-changed', change);
  }, []);

  useEffect(() => {
    const context = { chain: chainRef.current.key, target };
    if (retainedKey.current !== key) retained.current = initialResult<T>(context);
    retainedKey.current = key;
    const selectedChain = chainRef.current;
    let result = retained.current.context.chain === context.chain && retained.current.context.target === target ? retained.current : initialResult<T>(context);
    let disposed = false, paused = !!pollMs && document.visibilityState === 'hidden';
    let active: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let version = 0;
    const completions: ((error?: unknown) => void)[] = [];
    let failures = 0, queued = false, recovered = false, unchanged = false, invalidated = false;
    const publish = () => {
      if (!disposed && currentKey.current === key) setView({ key, result, busy: !!active && !paused, paused, recovered, unchanged });
    };
    const clearTimer = () => { clearTimeout(timer); timer = undefined; };
    const schedule = (delay: number) => {
      clearTimer();
      if (!disposed && enabled && !paused) timer = setTimeout(() => void run(), Math.max(0, delay));
    };
    const run = async () => {
      if (disposed || !enabled || paused || active) return;
      const wait = (result.error?.retryAt ?? 0) - Date.now();
      if (wait > 0) { if (pollMs || invalidated) schedule(wait); return; }
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
      const next = await readQuery(context, () => loader.current(client, invalidated ? null : previous.data), previous);
      if (['success', 'empty', 'partial', 'not-found'].includes(next.status)) next.observations = client.observations;
      active = null;
      if (disposed || currentKey.current !== key) return;
      if (!controller.signal.aborted) {
        if (next.error && next.error.kind !== 'cancelled') {
          failures++;
          if (pollMs) {
            const backoff = [3000, 6000, 12000, 30000][Math.min(failures - 1, 3)];
            next.error = { ...next.error, retryAt: Math.max(next.error.retryAt ?? 0, Date.now() + backoff) + Math.floor(Math.random() * 1000) };
          }
        } else if (!next.error) {
          invalidated = false;
          recovered = failures > 0;
          unchanged = !!next.blockHeight && next.blockHeight === previous.blockHeight;
          failures = 0;
        }
        result = next;
        retained.current = next;
      } else if (version === startedVersion) result = previous;
      publish();
      if (queued) { void run(); return; }
      completions.splice(0).forEach(finish => finish(result.error ? new QueryError(result.error) : undefined));
      if (pollMs) schedule(Math.max(0, (result.error?.retryAt ?? Date.now() + pollMs) - Date.now()));
    };
    const cancel = () => { clearTimer(); active?.abort(); };
    const control = { refresh: async () => { invalidateQueryReads(selectedChain); await run(); }, cancel };
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
      const detail = (event as CustomEvent<{ chain: string; targets: string[]; claimed?: Set<string>; refreshes?: Promise<void>[] }>).detail;
      if (!enabled || detail.chain !== context.chain || !detail.targets.includes(target)) return;
      detail.claimed?.add(target);
      detail.refreshes?.push(new Promise<void>((resolve, reject) => completions.push(error => error ? reject(error) : resolve())));
      cancel();
      version++;
      // Wait for the cancelled cycle to settle; coalesce repeated invalidations.
      // Keep the same-context view mounted (including its transaction receipt)
      // while refreshing. Invalidate the loader's cursor separately so an
      // unchanged height cannot reuse pre-inclusion data. Errors retain the
      // old observation and Retry-After deadline until a successful reload.
      invalidated = true;
      result = { ...result, status: result.error ? result.status : 'loading' };
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
      completions.splice(0).forEach(finish => finish());
      if (runtime.current === control) runtime.current = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('explorer:queries-invalidated', invalidate);
    };
  }, [key, target, enabled, pollMs]);
  const matches = enabled && view.key === key && view.result.context.chain === chain.key && view.result.context.target === target;
  const result = matches ? view.result : initialResult<T>({ chain: chain.key, target });
  return { result, refresh, busy: enabled && !view.paused && (matches ? view.busy || result.status === 'idle' : true), paused: matches && view.paused, recovered: matches && view.recovered, unchanged: matches && view.unchanged };
}
