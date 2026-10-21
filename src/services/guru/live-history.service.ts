import { QueryError, schemaError } from '@/lib/query-result';
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
  if (height < Number(previous.height)) throw new QueryError({ kind: 'incomplete', message: '노드 최신 높이가 이전 성공 높이보다 낮습니다. 이전 데이터를 보존합니다.' });
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
      if (!block || Number(block.height) !== h) schemaError('요청한 블록 높이와 응답이 다릅니다.');
      return block;
    }));
    const failed = settled.find(row => row.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    for (const row of settled) if (row.status === 'fulfilled') blocks.set(Number(row.value.height), row.value);
  }
  return { rows: [...blocks.values()].sort((a, b) => Number(b.height) - Number(a.height)), height: String(height), fromHeight, chain: client.chain.key,
    scope: `조회 범위 #${fromHeight}–#${height} · 최신 최대 100블록 보관. 범위 밖 이력은 이 목록에서 제공하지 않습니다.` };
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
  let limited = prior?.scope.includes('블록별') ?? false;
  for (let h = height; h >= start; h--) {
    const page = await getTransactionsAtHeight(h, client);
    rows.push(...page.rows);
    limited ||= page.limited;
  }
  const merged = [...new Map(rows.map(row => [row.hash.toUpperCase(), row])).values()].sort(compareAddressTransactions);
  return { rows: merged.slice(0, 150), height: String(height), fromHeight, chain: client.chain.key,
    scope: `조회 범위 #${fromHeight}–#${height} · 최근 최대 120블록 검색, 최대 150거래 보관. 범위 밖·보관 상한 초과 이력은 제공하지 않습니다.${limited ? ' 블록별 최대 150건 조회: 추가 거래 또는 전체 개수 미확인 구간이 있어 전체 이력이 아닙니다.' : ''}` };
}
