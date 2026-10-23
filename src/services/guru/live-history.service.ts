
import { serviceMessage, serviceText } from '@/i18n/service-message';
import { combinedError, QueryError, schemaError } from '@/lib/query-result';
import type { QueryClient } from '@/services/clients';
import { getLatestBlockHeight } from './blocks.service';
import { getBlockDetail, type BlockDetail } from './block-details.service';
import { compareAddressTransactions, getTransactionsAtHeight } from './transactions.service';
import type { TxDetail } from './tx-details.service';

export type LiveHistory<T> = {
  rows: T[];
  height: string;
  fromHeight: number;
  chain: string;
  scope: string;
};
function priorFor<T>(client: QueryClient, previous: LiveHistory<T> | null, height: number) {
  if (previous?.chain !== client.chain.key) return null;
  if (height < Number(previous.height)) throw new QueryError({ kind: 'incomplete', ...serviceMessage("the_node_s_latest_height_is_below_the_previous_successful") });
  return previous;
}

/** Commit a contiguous window only when every requested block succeeds. */
export async function getLiveBlocks(client: QueryClient, previous: LiveHistory<BlockDetail> | null): Promise<LiveHistory<BlockDetail>> {
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
      const block = await getBlockDetail(String(h), client);
      if (!block || Number(block.height) !== h) schemaError(serviceText("response_differs_from_the_requested_block_height"));
      return block;
    }));
    const errors = settled.flatMap(row => row.status === 'rejected' ? [row.reason] : []);
    // Preserve every failure and the latest Retry-After deadline in this batch.
    if (errors.length) throw new QueryError(combinedError(errors));
    for (const row of settled) if (row.status === 'fulfilled') blocks.set(Number(row.value.height), row.value);
  }
  return { rows: [...blocks.values()].sort((a, b) => Number(b.height) - Number(a.height)), height: String(height), fromHeight, chain: client.chain.key,
    scope: serviceText("query_range_up_to_100_recent_blocks_retained_history_outside", { value0: String(fromHeight), value1: String(height) }) };
}

/** Successful snapshots are the cursor, including empty blocks; failed cycles never advance it. */
export async function getLiveTransactions(client: QueryClient, previous: LiveHistory<TxDetail> | null): Promise<LiveHistory<TxDetail>> {
  const height = await getLatestBlockHeight(client);
  const prior = priorFor(client, previous, height);
  if (prior && height === Number(prior.height)) return prior;
  const fromHeight = Math.max(1, height - 119);
  const start = Math.max(fromHeight, prior ? Number(prior.height) + 1 : fromHeight);
  const rows = (prior?.rows ?? []).filter(row => Number(row.height) >= fromHeight);
  // Report per-height truncation/unknown totals even when those rows later leave the retained list.
  let limited = prior?.scope.includes(serviceText("by_block")) ?? false;
  for (let h = height; h >= start; h--) {
    const page = await getTransactionsAtHeight(h, client);
    rows.push(...page.rows);
    limited ||= page.limited;
  }
  const merged = [...new Map(rows.map(row => [row.hash.toUpperCase(), row])).values()].sort(compareAddressTransactions);
  return { rows: merged.slice(0, 150), height: String(height), fromHeight, chain: client.chain.key,
    scope: serviceText("query_range_up_to_120_recent_blocks_searched_and_150", { value0: String(fromHeight), value1: String(height), value2: String(limited ? serviceText("block_transaction_limit_notice") : '') }) };
}
