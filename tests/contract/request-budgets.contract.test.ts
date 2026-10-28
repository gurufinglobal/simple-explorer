import { afterEach, expect, it, vi } from 'vitest';
import { createQueryClient, invalidateQueryReads, requestJson } from '@/services/clients';
import { getActiveChainConfig } from '@/lib/chain-selection';
import { getAddressBalances, getSpendableBalances } from '@/services/guru/address-profile.service';
import { getWalletPortfolio } from '@/services/guru/wallet-portfolio.service';
import { getUnbonding } from '@/services/guru/unbonding.service';
import { getValidatorDetail, getValidatorsPage } from '@/services/guru/staking.service';
import { getAccountsTotal, getApplicationVersions, getNetworkSummary } from '@/services/guru/network-summary.service';
import { getLiveBlocks, getLiveTransactions } from '@/services/guru/live-history.service';
import { getBlockDetail } from '@/services/guru/block-details.service';
import { getDenomsMetadata } from '@/services/guru/token-metadata.service';
import { getStakingParams } from '@/services/guru/amount-context.service';
import { readQuery } from '@/lib/query-result';
import * as hashes from '@/lib/tx-hash';
import { mockQueryHttp } from '../helpers/query-http';
const header = (height: number, txs: string[] = []) => ({ block: { header: { height: String(height), chain_id: 'fixture', time: new Date(1700000000000 + height * 1000).toISOString() }, data: { txs } } });
const client = () => createQueryClient(getActiveChainConfig());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function dashboard(url: URL): unknown {
  const p = url.pathname;
  if (p.endsWith('/denoms_metadata')) return { metadatas: [], pagination: { next_key: null } };
  if (p.endsWith('/params')) return { params: { bond_denom: 'agxn', unbonding_time: '1s' } };
  if (p.endsWith('/blocks/latest')) return header(1000);
  if (p.includes('/blocks/')) return header(Number(p.split('/').at(-1)));
  if (p.endsWith('/supply/by_denom')) return { amount: { denom: 'agxn', amount: '10' } };
  if (p.endsWith('/pool')) return { pool: { bonded_tokens: '1' } };
  if (p.endsWith('/inflation')) return { inflation: '0.1' };
  if (p.endsWith('/validators')) return { validators: [], pagination: { next_key: null } };
  if (p.endsWith('/node_info')) return { default_node_info: { network: 'fixture' }, application_version: { version: '1' } };
  if (p.endsWith('/accounts')) return { pagination: { total: '1' } };
  throw new Error(p);
}
it('reuses the audit dashboard fixture: 21 → 18 requests; metadata/params once, no latest-height repeat', async () => {
  const http = mockQueryHttp(dashboard), query = client();
  await Promise.all([getNetworkSummary(query), getValidatorsPage(100, query), getApplicationVersions(query), getAccountsTotal(query)]);
  expect(http).toHaveBeenCalledTimes(18);
  for (const path of ['/denoms_metadata', '/staking/v1beta1/params']) expect(http.mock.calls.filter(([url]) => String(url).includes(path))).toHaveLength(1);
  expect(http.mock.calls.some(([url]) => String(url).endsWith('/blocks/1000'))).toBe(false);
});
it.each([getAddressBalances, getSpendableBalances])('bounds the audit 250-page fixture at 50 pages and rejects incomplete balances', async read => {
  let pages = 0;
  const http = mockQueryHttp(() => ({ balances: [{ denom: 'agxn', amount: '1' }], pagination: { next_key: ++pages < 250 ? String(pages) : null } }));
  await expect(read('fixture-address', client())).rejects.toMatchObject({ info: { kind: 'incomplete', messageCode: 'query_budget_exceeded' } });
  expect(http).toHaveBeenCalledTimes(50);
  expect(http.mock.calls.every(([url]) => new URL(String(url)).searchParams.get('pagination.limit') === '100')).toBe(true);
});
it.each(['rows', 'cycle'])('rejects oversized single responses / cyclic cursors: %s', async mode => {
  const http = mockQueryHttp(() => ({ balances: Array.from({ length: mode === 'rows' ? 5001 : 1 }, () => ({ denom: 'agxn', amount: '1' })), pagination: { next_key: 'repeat' } }));
  await expect(getAddressBalances('a', client())).rejects.toMatchObject({ info: { kind: 'incomplete' } });
  expect(http).toHaveBeenCalledTimes(mode === 'rows' ? 1 : 2);
});
it('portfolio and validator totals remain unavailable after page limits, while successful fields survive', async () => {
  let pages = 0;
  mockQueryHttp(url => {
    const p = url.pathname;
    if (p.includes('/denoms_metadata') || p.endsWith('/params')) return dashboard(url);
    if (p.includes('/balances/')) return { balances: [] };
    if (p.includes('/unbonding_delegations')) return { unbonding_responses: [] };
    if (p.endsWith('/rewards')) return { total: [] };
    if (p.endsWith('/validators/invalid')) return { validator: { operator_address: 'invalid', tokens: '100' } };
    if (p.endsWith('/outstanding_rewards')) return { rewards: { rewards: [] } };
    if (p.endsWith('/commission')) return { commission: { commission: [] } };
    return { delegation_responses: [{ balance: { denom: 'agxn', amount: '1' } }], pagination: { next_key: String(++pages) } };
  });
  const portfolio = await readQuery({ chain: 'fixture', target: 'portfolio:a' }, () => getWalletPortfolio('a', client()));
  expect(portfolio.status).toBe('partial'); expect(portfolio.data?.staking).toBe('—'); expect(portfolio.data?.details?.staking).toBeUndefined();
  expect(pages).toBe(50); pages = 0;
  const validator = await readQuery({ chain: 'fixture', target: 'validator' }, () => getValidatorDetail('invalid', client()));
  expect(validator.status).toBe('partial'); expect(validator.data?.totalDelegationAmount).toBe('-'); expect(validator.data?.amountCoins?.totalDelegationAmount).toBeUndefined();
  expect(pages).toBe(50);
});
it('bounds nested unbonding entries and refuses a partial total', async () => {
  mockQueryHttp(() => ({ unbonding_responses: [{ validator_address: 'v', entries: Array.from({ length: 5001 }, () => ({ balance: '1' })) }] }));
  await expect(getUnbonding('a', 'agxn', client())).rejects.toMatchObject({ info: { kind: 'incomplete' } });
});
it('all pagination requests share a 30-second deadline and caller cancellation', async () => {
  vi.useFakeTimers(); let pages = 0;
  mockQueryHttp(() => new Promise(resolve => setTimeout(() => resolve({ balances: [], pagination: { next_key: String(++pages) } }), 6000)));
  const result = getAddressBalances('a', client()).catch(error => error);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await result).toMatchObject({ info: { kind: 'timeout', messageCode: 'query_cycle_deadline' } });
  const controller = new AbortController(); controller.abort();
  await expect(getAddressBalances('b', createQueryClient(getActiveChainConfig(), controller.signal))).rejects.toMatchObject({ info: { kind: 'cancelled' } });
  await vi.advanceTimersByTimeAsync(10_000);
});
it('same audit transaction fixture costs 31 instead of 121; a late failure within the new window costs 33 including retry', async () => {
  let failure = 31;
  const http = mockQueryHttp(url => {
    if (url.pathname.endsWith('/latest')) return header(150);
    const height = Number(url.searchParams.get('query')?.split('=')[1]);
    return height === failure ? new Response('', { status: 500 }) : { tx_responses: [], total: '0' };
  });
  const query = client();
  expect((await getLiveTransactions(query, null)).fromHeight).toBe(121); expect(http).toHaveBeenCalledTimes(31);
  http.mockClear(); failure = 121;
  await expect(getLiveTransactions(query, null)).rejects.toThrow(); expect(http).toHaveBeenCalledTimes(31);
  failure = 0;
  const recovered = await getLiveTransactions(query, null); expect(recovered.fromHeight).toBe(121); expect(http).toHaveBeenCalledTimes(33);
});
it('stops after 150 transactions and isolates same-key endpoint changes', async () => {
  const http = mockQueryHttp(url => url.pathname.endsWith('/latest') ? header(150) : { tx_responses: Array.from({ length: 150 }, (_, i) => ({ txhash: String(i), height: '150', code: 0 })), total: '150' });
  const query = client(), first = await getLiveTransactions(query, null);
  expect(first.fromHeight).toBe(150); expect(http).toHaveBeenCalledTimes(2);
  const other = createQueryClient({ ...query.chain, lcdUrl: 'https://other.example' });
  await getLiveTransactions(other, first); expect(http).toHaveBeenCalledTimes(4);
});
it('transaction cycle deadline cancels slow sequential height reads', async () => {
  vi.useFakeTimers();
  mockQueryHttp(url => url.pathname.endsWith('/latest') ? header(150) : new Promise(resolve => setTimeout(() => resolve({ tx_responses: [], total: '0' }), 6000)));
  const result = getLiveTransactions(client(), null).catch(error => error);
  await vi.advanceTimersByTimeAsync(30_000); expect(await result).toMatchObject({ info: { kind: 'timeout' } });
  await vi.advanceTimersByTimeAsync(10_000);
});
it('large-block list performs zero hashes; detail still hashes every transaction; full-block transfer remains', async () => {
  const txs = Array.from({ length: 1000 }, () => 'AQID');
  const payload = header(1, txs); const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  const hash = vi.spyOn(hashes, 'txRawBase64ToTxHashHex');
  const http = mockQueryHttp(() => payload);
  const rows = await getLiveBlocks(client(), null);
  expect(rows.rows[0].txCount).toBe(1000); expect(hash).not.toHaveBeenCalled(); expect(http).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(rows).length).toBeLessThan(bytes);
  const detail = await getBlockDetail('1', client()); expect(hash).toHaveBeenCalledTimes(1000); expect(detail?.txs).toHaveLength(1000);
  expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBe(bytes);
});
it('shares metadata and params across clients, bounds TTL, invalidates, and isolates chain/endpoint/height', async () => {
  vi.useFakeTimers(); const http = mockQueryHttp(dashboard), query = client();
  await Promise.all([getDenomsMetadata(query), getDenomsMetadata(client()), getStakingParams(query), getStakingParams(client())]);
  expect(http).toHaveBeenCalledTimes(2);
  await getStakingParams(query); expect(http).toHaveBeenCalledTimes(2);
  await query.lcdGetObserved('/cosmos/staking/v1beta1/params', '1'); expect(http).toHaveBeenCalledTimes(3);
  await getStakingParams(createQueryClient({ ...query.chain, chainId: 'different' }));
  await getStakingParams(createQueryClient({ ...query.chain, key: 'different' }));
  await getStakingParams(createQueryClient({ ...query.chain, lcdUrl: 'https://other.example' })); expect(http).toHaveBeenCalledTimes(6);
  await vi.advanceTimersByTimeAsync(30_000); await getStakingParams(query); expect(http).toHaveBeenCalledTimes(7);
  invalidateQueryReads(query.chain); await getStakingParams(query); expect(http).toHaveBeenCalledTimes(8);
});
it('one subscriber cancellation preserves its sibling; failed responses never poison retries', async () => {
  let finish!: (value: unknown) => void;
  const http = mockQueryHttp(() => new Promise(resolve => { finish = resolve; }));
  const first = new AbortController(), second = new AbortController();
  const a = getStakingParams(createQueryClient(getActiveChainConfig(), first.signal)).catch(error => error);
  const b = getStakingParams(createQueryClient(getActiveChainConfig(), second.signal));
  first.abort(); expect(await a).toMatchObject({ info: { kind: 'cancelled' } });
  expect(http.mock.calls[0][1]?.signal?.aborted).toBe(false);
  finish({ params: { bond_denom: 'agxn', unbonding_time: '1s' } }); await b; expect(http).toHaveBeenCalledTimes(1);
  invalidateQueryReads(); http.mockResolvedValueOnce(new Response('', { status: 500 }));
  await expect(getStakingParams(client())).rejects.toThrow();
  http.mockResolvedValue(Response.json({ params: { bond_denom: 'agxn', unbonding_time: '1s' } }));
  await getStakingParams(client()); expect(http).toHaveBeenCalledTimes(3);
});
it('endpoint queue limits 10 active + 100 waiting, removes cancelled waiters, and drains after completion', async () => {
  const finishes: (() => void)[] = []; let active = 0, peak = 0;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { active++; peak = Math.max(peak, active); finishes.push(() => { active--; resolve(Response.json({ ok: true })); }); })));
  const controllers = Array.from({ length: 111 }, () => new AbortController());
  const jobs = controllers.map((c, i) => requestJson(`https://queue.example/${i}`, {}, { signal: c.signal }).catch(error => error));
  expect(finishes).toHaveLength(10); expect(await jobs[110]).toMatchObject({ info: { kind: 'incomplete' } });
  for (let i = 10; i < 110; i++) controllers[i].abort();
  await Promise.all(jobs.slice(10));
  finishes.splice(0).forEach(finish => finish()); await Promise.all(jobs.slice(0, 10));
  expect(peak).toBe(10);
  const last = requestJson('https://queue.example/last'); expect(finishes).toHaveLength(1); finishes[0](); await last;
});
it('bounds the shared cache at 256 paths and does not cache malformed params failures', async () => {
  const http = mockQueryHttp(() => ({ params: { bond_denom: 'agxn', unbonding_time: '1s' } }));
  const query = client();
  for (let i = 0; i < 257; i++) await query.lcdGet(`/cosmos/staking/v1beta1/params?scope=${i}`);
  await query.lcdGet('/cosmos/staking/v1beta1/params?scope=0'); expect(http).toHaveBeenCalledTimes(258);
  http.mockResolvedValueOnce(Response.json({ params: {} })); await expect(getStakingParams(query)).rejects.toThrow();
  await expect(getStakingParams(query)).resolves.toMatchObject({ bondDenom: 'agxn' });
});
it('queue waiting consumes the HTTP timeout, launches no expired requests, and releases every slot', async () => {
  vi.useFakeTimers();
  const http = vi.fn<typeof fetch>((_, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  vi.stubGlobal('fetch', http);
  const jobs = Array.from({ length: 12 }, (_, i) => requestJson(`https://timeout.example/${i}`).catch(error => error));
  expect(http).toHaveBeenCalledTimes(10);
  await vi.advanceTimersByTimeAsync(10_000);
  for (const error of await Promise.all(jobs)) expect(error).toMatchObject({ info: { kind: 'timeout' } });
  expect(http).toHaveBeenCalledTimes(10);
  http.mockResolvedValue(Response.json({ ok: true }));
  await expect(requestJson('https://timeout.example/recovered')).resolves.toEqual({ ok: true });
});
it('caller cancellation stops mid-pagination with no additional requests or partial balances', async () => {
  const controller = new AbortController(); let pages = 0;
  const http = mockQueryHttp(() => {
    if (++pages === 2) controller.abort();
    return { balances: [{ denom: 'agxn', amount: '1' }], pagination: { next_key: String(pages) } };
  });
  await expect(getSpendableBalances('a', createQueryClient(getActiveChainConfig(), controller.signal))).rejects.toMatchObject({ info: { kind: 'cancelled' } });
  expect(http).toHaveBeenCalledTimes(2);
});
