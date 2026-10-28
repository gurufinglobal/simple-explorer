"use client";
import { serviceMessage, serviceText } from '@/i18n/service-message';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveChainConfig } from '@/lib/chain-selection';
import type { ChainConfig } from '@/lib/env';
import { initialResult, PartialQueryError, QueryError, queryError, type QueryResult, type QueryErrorInfo } from '@/lib/query-result';
import type { QueryPage } from '@/lib/query-page';
import { invalidateQueryReads, queryIdentity, createQueryClient, type QueryClient } from '@/services/clients';

type State<T> = {
  key: string; result: QueryResult<T[]>; nextCursor: string | null;
  seen: string[]; pages: number; stopReason?: string; warning?: QueryErrorInfo;
};
export const MAX_QUERY_PAGES = 50;

export function usePagedQuery<T>(target: string, load: (client: QueryClient, cursor: string | null) => Promise<QueryPage<T>>,
  identify: (row: T) => string, pinnedChain?: ChainConfig, filter = '') {
  const [, changeChain] = useState(0);
  const chain = pinnedChain ?? getActiveChainConfig();
  const key = JSON.stringify([queryIdentity(chain), target, filter]);
  const fresh = useCallback((): State<T> => ({ key, result: initialResult({ chain: chain.key, target }), nextCursor: null, seen: [], pages: 0 }), [key, chain.key, target]);
  const [state, setState] = useState<State<T>>(fresh);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  const refs = useRef({ key, chain, load, identify });
  refs.current = { key, chain, load, identify };
  const active = useRef<AbortController | null>(null);

  // Return the read outcome without rejecting ordinary mount/button loads.
  // Invalidation callers translate this outcome into their awaited refresh promise.
  const fetchPage = useCallback(async (reset = false): Promise<QueryErrorInfo | null> => {
    const cancelled = (): QueryErrorInfo => ({ kind: 'cancelled', ...serviceMessage('query_cancelled') });
    if (active.current) return cancelled();
    const current = refs.current;
    const previous = !reset && stateRef.current.key === key ? stateRef.current : fresh();
    if (previous.stopReason || (previous.pages > 0 && !previous.nextCursor)) return previous.result.error;
    if ((previous.result.error?.retryAt ?? 0) > Date.now()) return previous.result.error;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setState({ ...previous, result: { ...previous.result, status: 'loading' } });
    try {
      const client = createQueryClient(current.chain, controller.signal);
      let page: QueryPage<T>;
      try { page = await current.load(client, previous.nextCursor); }
      catch (error) {
        if (!(error instanceof PartialQueryError)) throw error;
        page = { ...(error.data as QueryPage<T>), warning: error.info };
      }
      if (controller.signal.aborted || refs.current.key !== key) return cancelled();
      const rows = Array.from(new Map([...(previous.result.data ?? []), ...page.rows].map(row => [current.identify(row), row])).values());
      const seen = [...previous.seen, previous.nextCursor ?? ''];
      const pages = previous.pages + 1;
      const stopReason = page.stopReason ?? (page.nextCursor && seen.includes(page.nextCursor)
        ? serviceText("stopped_after_detecting_a_repeated_or_cyclic_cursor_results_are")
        : page.nextCursor && pages >= MAX_QUERY_PAGES ? serviceText("reached_the_query_limit_pages_results_are_partial", { value0: String(MAX_QUERY_PAGES) }) : undefined);
      // Successful retry clears a transport error; a prior partial page warning persists.
      const partial = page.warning ?? previous.warning;
      const next: State<T> = { key, seen, pages, nextCursor: page.nextCursor, stopReason, warning: partial, result: {
        context: previous.result.context, data: rows, observedAt: new Date().toISOString(),
        observations: [...(previous.result.observations ?? []), ...client.observations],
        error: partial ?? null, status: partial || stopReason ? 'partial' : rows.length ? 'success' : 'empty',
      } };
      stateRef.current = next; setState(next);
      return partial ?? (stopReason ? { kind: 'incomplete', message: stopReason } : null);
    } catch (error) {
      if (controller.signal.aborted || refs.current.key !== key) return cancelled();
      const next: State<T> = { ...previous, result: { ...previous.result, status: previous.pages ? 'stale' : 'error', error: queryError(error) } };
      stateRef.current = next; setState(next);
      return next.result.error;
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }, [key, fresh]);
  const refresh = useCallback(() => {
    invalidateQueryReads(refs.current.chain);
    active.current?.abort(); active.current = null;
    return fetchPage(true);
  }, [fetchPage]);
  useEffect(() => {
    const change = () => {
      if (pinnedChain) return;
      try { if (queryIdentity(getActiveChainConfig()) === queryIdentity(refs.current.chain)) return; }
      catch { active.current?.abort(); active.current = null; return; }
      active.current?.abort(); active.current = null;
      changeChain(n => n + 1);
    };
    window.addEventListener('explorer:chain-changed', change);
    return () => window.removeEventListener('explorer:chain-changed', change);
  }, [pinnedChain]);
  useEffect(() => {
    const invalidate = (event: Event) => {
      const detail = (event as CustomEvent<{ chain: string; targets: string[]; claimed?: Set<string>; refreshes?: Promise<void>[] }>).detail;
      if (detail.chain !== refs.current.chain.key || !detail.targets.includes(target)) return;
      detail.claimed?.add(target);
      const pending = refresh();
      if (detail.refreshes) detail.refreshes.push(pending.then(error => {
        if (error) throw new QueryError(error);
      }));
    };
    window.addEventListener('explorer:queries-invalidated', invalidate);
    return () => window.removeEventListener('explorer:queries-invalidated', invalidate);
  }, [target, refresh]);
  useEffect(() => {
    void fetchPage(true);
    return () => { active.current?.abort(); active.current = null; };
  }, [fetchPage]);
  const visible = state.key === key ? state : fresh();
  return {
    result: visible.result, busy: busy || visible.result.status === 'idle', refresh,
    loadMore: () => void fetchPage(), nextCursor: visible.nextCursor,
    hasMore: !!visible.nextCursor && !visible.stopReason,
    stopReason: visible.stopReason, pages: visible.pages,
  };
}
