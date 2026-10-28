import { QueryError } from '@/lib/query-result';
import { serviceMessage } from '@/i18n/service-message';
import type { QueryClient } from './clients';

/** Includes network waiting, pagination and conversion time in one deadline. */
export async function withReadDeadline<T>(client: QueryClient, run: (bounded: QueryClient) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const signal = client.signal ? AbortSignal.any([client.signal, controller.signal]) : controller.signal;
  const deadline = Date.now() + 30_000;
  const check = () => {
    if (client.signal?.aborted) throw new QueryError({ kind: 'cancelled', ...serviceMessage('query_cancelled') });
    if (Date.now() >= deadline || controller.signal.aborted) throw new QueryError({ kind: 'timeout', ...serviceMessage('query_cycle_deadline') });
  };
  const bounded: QueryClient = { ...client, signal,
    lcdGet: async <R>(path: string) => { check(); const result = await client.lcdGet<R>(path, { signal }); check(); return result; },
    lcdGetObserved: async <R>(path: string, height?: string) => { check(); const result = await client.lcdGetObserved<R>(path, height, { signal }); check(); return result; },
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([run(bounded), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new QueryError({ kind: 'timeout', ...serviceMessage('query_cycle_deadline') })); }, 30_000);
    })]);
    check();
    return result;
  } catch (error) { check(); throw error; }
  finally { clearTimeout(timer); controller.abort(); }
}

/** Aggregate callers receive no partial sum when any page is unavailable. */
export async function collectPages<T>(client: QueryClient,
  page: (client: QueryClient, cursor: string | null, remaining: number) => Promise<{ rows: T[]; next?: string | null }>): Promise<T[]> {
  return withReadDeadline(client, async bounded => {
    const rows: T[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let count = 0; count < 50; count++) {
      const result = await page(bounded, cursor, 5000 - rows.length);
      rows.push(...boundedRows(result.rows, 5000 - rows.length));
      if (!result.next) return rows;
      if (seen.has(result.next)) throw new QueryError({ kind: 'incomplete', ...serviceMessage('pagination_cursor_repeated') });
      seen.add(result.next); cursor = result.next;
      if (rows.length >= 5000) break;
    }
    throw new QueryError({ kind: 'incomplete', ...serviceMessage('query_budget_exceeded') });
  });
}

export function boundedRows<T>(rows: T[], remaining: number): T[] {
  if (rows.length > remaining) throw new QueryError({ kind: 'incomplete', ...serviceMessage('query_budget_exceeded') });
  return rows;
}
