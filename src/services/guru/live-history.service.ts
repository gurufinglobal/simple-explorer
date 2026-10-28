import { withReadDeadline } from '../query-budget';
import { queryIdentity } from '../clients';

import { serviceMessage, serviceText } from '@/i18n/service-message';
import { combinedError, QueryError, schemaError } from '@/lib/query-result';
import type { QueryClient } from '@/services/clients';
import { getLatestBlockHeight } from './blocks.service';
import { getBlockSummary, type BlockSummary } from './block-details.service';
import { compareAddressTransactions, getTransactionsAtHeight } from './transactions.service';
import type { TxDetail } from './tx-details.service';

export type LiveHistory<T> = {
  rows: T[];
  height: string;
  fromHeight: number;
  chain: string;
  scope: string;
  source?: string;
  limited?: boolean;
};
function priorFor<T>(client: QueryClient, previous: LiveHistory<T> | null, height: number) {
  if (previous?.chain !== client.chain.key || (previous.source && previous.source !== queryIdentity(client.chain))) return null;
  if (height < Number(previous.height)) throw new QueryError({ kind: 'incomplete', ...serviceMessage("the_node_s_latest_height_is_below_the_previous_successful") });
  return previous;
}

/** Commit a contiguous window only when every requested block succeeds. */
export async function getLiveBlocks(client: QueryClient, previous: LiveHistory<BlockSummary> | null): Promise<LiveHistory<BlockSummary>> {
  const height = await getLatestBlockHeight(client);
  const prior = priorFor(client, previous, height);
  if (prior && height === Number(prior.height)) return prior;
  const fromHeight = Math.max(prior?.fromHeight ?? 1, height - (prior ? 99 : 49));
  const blocks = new Map((prior?.rows ?? []).filter(row => Number(row.height) >= fromHeight).map(row => [Number(row.height), row]));
  const missing = [];
  for (let h = height; h >= fromHeight; h--) if (!blocks.has(h)) missing.push(h);
  // Bounded request concurrency; await siblings before reporting a failed cycle.
  for (let i = 0; i < missing.length; i += 10) {
    const settled = await Promise.allSettled(missing.slice(i, i + 10).map(async h => {
      const block = await getBlockSummary(String(h), client);
      if (!block || Number(block.height) !== h) schemaError(serviceText("response_differs_from_the_requested_block_height"));
      return block;
    }));
    const errors = settled.flatMap(row => row.status === 'rejected' ? [row.reason] : []);
    // Preserve every failure and the latest Retry-After deadline in this batch.
    if (errors.length) throw new QueryError(combinedError(errors));
    for (const row of settled) if (row.status === 'fulfilled') blocks.set(Number(row.value.height), row.value);
  }
  return { rows: [...blocks.values()].sort((a, b) => Number(b.height) - Number(a.height)), height: String(height), fromHeight, chain: client.chain.key, source: queryIdentity(client.chain),
    scope: serviceText("query_range_up_to_100_recent_blocks_retained_history_outside", { value0: String(fromHeight), value1: String(height) }) };
}

type HeightPage = Awaited<ReturnType<typeof getTransactionsAtHeight>>;
const retries = new Map<string, { expires: number; pages: Map<number, HeightPage> }>();
export function clearLiveTransactionCache() { retries.clear(); }

/** Only failures retain fetched heights; published snapshots remain atomic. */
export async function getLiveTransactions(client: QueryClient, previous: LiveHistory<TxDetail> | null): Promise<LiveHistory<TxDetail>> {
  return withReadDeadline(client, async bounded => {
    const height = await getLatestBlockHeight(bounded);
    const prior = priorFor(client, previous, height);
    if (prior && height === Number(prior.height)) return prior;
    const identity = queryIdentity(client.chain);
    let cached = retries.get(identity);
    if (!cached || cached.expires <= Date.now()) {
      if (retries.size >= 8) retries.delete(retries.keys().next().value!);
      cached = { expires: Date.now() + 30_000, pages: new Map() }; retries.set(identity, cached);
    }
    for (const h of cached.pages.keys()) if (h > height || h < height - 29) cached.pages.delete(h);
    const start = Math.max(1, height - 29, prior ? Number(prior.height) + 1 : 1);
    const rows: TxDetail[] = [];
    let fromHeight = height, limited = false;
    for (let h = height; h >= start; h--) {
      const page = cached.pages.get(h) ?? await getTransactionsAtHeight(h, bounded);
      cached.pages.set(h, page);
      rows.push(...page.rows); limited ||= page.limited; fromHeight = h;
      if (rows.length >= 150) break;
    }
    // Retain old rows only when the new searched range joins the prior window.
    if (prior && fromHeight === Number(prior.height) + 1) {
      fromHeight = Math.max(prior.fromHeight, height - 119);
      rows.push(...prior.rows.filter(row => Number(row.height) >= fromHeight));
      limited ||= prior.limited ?? false;
    }
    const merged = [...new Map(rows.map(row => [row.hash.toUpperCase(), row])).values()].sort(compareAddressTransactions);
    retries.delete(identity);
    return { rows: merged.slice(0, 150), height: String(height), fromHeight, chain: client.chain.key, source: identity, limited,
      scope: serviceText('bounded_transaction_scope', { value0: String(fromHeight), value1: String(height), value2: limited ? serviceText('block_transaction_limit_notice') : '' }) };
  });
}
