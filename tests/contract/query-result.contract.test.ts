import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '@/services/clients';
import { initialResult, readQuery, PartialQueryError } from '@/lib/query-result';
import { getAddressAccountInfo, getAddressBalances } from '@/services/guru/address-profile.service';
import { getLatestBlocks } from '@/services/guru/blocks.service';
import { getBexExchangeById, getBexExchangeFees } from '@/services/guru/bex.service';
import { block, mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
const context = { chain: 'fixture', target: 'address:test' };
afterEach(() => { vi.useRealTimers(); restoreHttpBoundary(); });
describe('read result and HTTP error contract', () => {
  it('distinguishes idle, zero, empty and confirmed absence', async () => {
    expect(initialResult(context).status).toBe('idle');
    expect(await readQuery(context, async () => 0)).toMatchObject({ status: 'success', data: 0, error: null });
    const http = mockQueryHttp(() => ({ balances: [] }));
    expect(await readQuery(context, () => getAddressBalances('test'))).toMatchObject({ status: 'empty', data: [] });
    http.mockResolvedValue(Response.json({ exchanges: [] }));
    expect(await readQuery(context, () => getBexExchangeById('1'))).toMatchObject({ status: 'not-found', data: null });
  });
  it.each([404, 429, 500])('preserves HTTP %s, never unsupported', async status => {
    mockQueryHttp(() => new Response('', { status, headers: { 'Retry-After': '5' } }));
    const before = Date.now();
    const result = await readQuery(context, () => getAddressBalances('test'));
    expect(result).toMatchObject({ status: 'error', error: { kind: 'http', status } });
    expect(result.error?.retryAt).toBeGreaterThanOrEqual(before + 5000);
  });
  it('parses HTTP-date Retry-After', async () => {
    const date = new Date(Date.now() + 10000).toUTCString();
    mockQueryHttp(() => new Response('', { status: 429, headers: { 'Retry-After': date } }));
    await expect(requestJson('https://lcd.example.test')).rejects.toMatchObject({ info: { retryAt: Date.parse(date) } });
  });
  it.each(['parse', 'schema', 'network'])('preserves %s', async kind => {
    const http = mockQueryHttp(() => kind === 'parse' ? new Response('bad') : {});
    if (kind === 'network') http.mockRejectedValue(new TypeError('offline'));
    expect(await readQuery(context, () => getAddressBalances('test'))).toMatchObject({ status: 'error', data: null, error: { kind } });
  });
  it('enforces 10 second timeout and separates caller cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init.signal!;
      if (signal.aborted) reject(new DOMException('aborted', 'AbortError'));
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const timed = readQuery(context, () => requestJson('https://lcd.example.test'));
    await vi.advanceTimersByTimeAsync(10000);
    expect(await timed).toMatchObject({ status: 'error', error: { kind: 'timeout' } });
    const controller = new AbortController();
    const cancelled = readQuery(context, () => requestJson('https://lcd.example.test', {}, { signal: controller.signal }));
    controller.abort();
    expect(await cancelled).toMatchObject({ status: 'cancelled', error: { kind: 'cancelled' } });
  });
  it('keeps previous data/time on refresh failure and changes all fields on retry success', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01'));
    const first = await readQuery(context, async () => ({ blockHeight: '1', value: 4 }));
    vi.setSystemTime(new Date('2026-01-02'));
    const stale = await readQuery(context, async () => { throw new TypeError('offline'); }, first);
    expect(stale).toMatchObject({ status: 'stale', data: first.data, observedAt: first.observedAt, blockHeight: '1' });
    const next = await readQuery(context, async () => ({ blockHeight: '2', value: 5 }), stale);
    expect(next).toMatchObject({ status: 'success', data: { value: 5 }, context, observedAt: '2026-01-02T00:00:00.000Z', blockHeight: '2', error: null });
    const changed = await readQuery({ ...context, target: 'other' }, async () => { throw new TypeError(); }, first);
    expect(changed).toMatchObject({ status: 'error', data: null, observedAt: null });
  });
  it('recognizes explicit auth account absence separately from bank zero', async () => {
    mockQueryHttp(url => url.pathname.includes('/auth/') ? Response.json({ code: 5, message: 'account test not found' }, { status: 404 }) : { balances: [{ denom: 'agxn', amount: '0' }] });
    expect(await readQuery(context, () => getAddressAccountInfo('test'))).toMatchObject({ status: 'not-found', error: { kind: 'not-found' } });
    expect(await readQuery(context, () => getAddressBalances('test'))).toMatchObject({ status: 'success', data: [{ amount: '0' }] });
  });
  it('preserves successful blocks when one detail fails', async () => {
    mockQueryHttp(url => url.pathname.endsWith('/latest') ? block('3') : url.pathname.endsWith('/2') ? new Response('', { status: 500 }) : block(url.pathname.split('/').at(-1)));
    const result = await readQuery(context, () => getLatestBlocks(3));
    expect(result).toMatchObject({ status: 'partial', error: { status: 500 } });
    expect(result.data?.map(b => b.height)).toEqual(['3', '1']);
  });
  it('preserves BEX fees with error detail for a failed sibling', async () => {
    mockQueryHttp(url => url.pathname.includes('/locked_fees') ? new Response('', { status: 429, headers: { 'Retry-After': '10' } }) : { coins: [{ denom: 'agxn', amount: '0' }] });
    const result = await readQuery(context, () => getBexExchangeFees('1'));
    expect(result).toMatchObject({ status: 'partial', data: { hasLockedError: true, collected: [{ amount: '0' }] }, error: { status: 429 } });
  });
  it('retains last successful snapshot on a partial refresh', async () => {
    const first = await readQuery(context, async () => [1, 2]);
    const next = await readQuery(context, async () => { throw new PartialQueryError([1], { kind: 'http', status: 500, message: 'failed page' }); }, first);
    expect(next).toMatchObject({ status: 'stale', data: [1, 2], observedAt: first.observedAt });
  });
});
