import { afterEach, expect, it, vi } from 'vitest';
import { getLiveBlocks, getLiveTransactions } from '@/services/guru/live-history.service';
import { createQueryClient } from '@/services/clients';
import { getActiveChainConfig } from '@/lib/chain-selection';
import { block, mockQueryHttp } from '../helpers/query-http';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const header = (height: number) => ({ ...block('1'), block: { ...block('1').block, header: { ...block('1').block.header, height: String(height) } } });
it('recovers 60 new blocks in <=10 concurrent HTTP requests, then bounds a >100 gap explicitly', async () => {
  let height = 150, active = 0, peak = 0;
  const http = mockQueryHttp(async url => {
    active++; peak = Math.max(peak, active); await Promise.resolve(); active--;
    return header(url.pathname.endsWith('/latest') ? height : Number(url.pathname.split('/').at(-1)));
  });
  const client = createQueryClient(getActiveChainConfig());
  const first = await getLiveBlocks(client, null); expect(http).toHaveBeenCalledTimes(51);
  await getLiveBlocks(client, first); expect(http).toHaveBeenCalledTimes(52);
  height = 210; const next = await getLiveBlocks(client, first);
  expect(next.rows.filter(row => Number(row.height) > 150).map(row => Number(row.height))).toEqual(Array.from({ length: 60 }, (_, i) => 210 - i));
  expect(next.rows).toHaveLength(100); expect(http).toHaveBeenCalledTimes(113); expect(peak).toBeLessThanOrEqual(10);
  height = 400; const gap = await getLiveBlocks(client, next);
  expect(gap.scope).toContain('#301–#400'); expect(gap.scope).toContain('범위 밖'); expect(gap.rows).toHaveLength(100);
});
it('counts initial/unchanged/new/empty polls, preserves cursor on failures and isolates chains', async () => {
  let height = 150, failed = 0;
  const scanned: number[] = [];
  const http = mockQueryHttp(url => {
    if (url.pathname.endsWith('/latest')) return header(height);
    const h = Number(url.searchParams.get('query')?.split('=')[1]); scanned.push(h);
    if (h === failed) return new Response('', { status: 500 });
    return { tx_responses: h % 2 ? [] : [{ txhash: String(h), height: String(h), code: 0 }], txs: [], total: h % 2 ? '0' : '1' };
  });
  const chain = getActiveChainConfig(), client = createQueryClient(chain);
  const first = await getLiveTransactions(client, null); expect(http).toHaveBeenCalledTimes(121);
  expect(first.fromHeight).toBe(31);
  await getLiveTransactions(client, first); expect(http).toHaveBeenCalledTimes(122);
  height = 151; const empty = await getLiveTransactions(client, first); expect(http).toHaveBeenCalledTimes(124); expect(empty.height).toBe('151');
  await getLiveTransactions(client, empty); expect(http).toHaveBeenCalledTimes(125);
  height = 152; const fresh = await getLiveTransactions(client, empty); expect(http).toHaveBeenCalledTimes(127); expect(fresh.rows[0].height).toBe('152');
  height = 212; failed = 210;
  await expect(getLiveTransactions(client, fresh)).rejects.toThrow('HTTP 500'); expect(fresh.height).toBe('152');
  failed = 0; scanned.length = 0;
  const recovered = await getLiveTransactions(client, fresh);
  expect(scanned).toEqual(Array.from({ length: 60 }, (_, i) => 212 - i)); expect(recovered.height).toBe('212');
  expect(new Set(recovered.rows.map(row => row.hash)).size).toBe(recovered.rows.length);
  scanned.length = 0;
  await getLiveTransactions(createQueryClient({ ...chain, key: 'other' }), recovered); expect(scanned).toHaveLength(120);
  height = 211; await expect(getLiveTransactions(client, recovered)).rejects.toThrow('이전 성공 높이보다 낮습니다');
});
it('shows per-height truncation and unknown totals without claiming full history, caps rows at 150', async () => {
  const http = mockQueryHttp(url => url.pathname.endsWith('/latest') ? header(1) : { tx_responses: Array.from({ length: 150 }, (_, i) => ({ txhash: `H${i}`, height: '1', code: 0 })), total: '200' });
  const client = createQueryClient(getActiveChainConfig());
  const result = await getLiveTransactions(client, null); expect(result.rows).toHaveLength(150); expect(result.scope).toContain('블록별 최대 150건');
  http.mockImplementation(async input => Response.json(String(input).endsWith('/latest') ? header(1) : { tx_responses: [], txs: [] }));
  expect((await getLiveTransactions(client, null)).scope).toContain('전체 개수 미확인');
});
it('abort between serial requests stops the cycle without promoting its examined heights', async () => {
  const controller = new AbortController(); let count = 0;
  mockQueryHttp(url => {
    if (url.pathname.endsWith('/latest')) return header(150);
    count++; controller.abort(); return { tx_responses: [], total: '0' };
  });
  await expect(getLiveTransactions(createQueryClient(getActiveChainConfig(), controller.signal), null)).rejects.toThrow('취소');
  expect(count).toBe(1);
});
