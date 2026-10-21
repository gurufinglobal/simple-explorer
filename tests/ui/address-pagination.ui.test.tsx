// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AddressTransactions } from '@/components/explorer/address-transactions';
import { getAddressTransactionsPage } from '@/services/guru/transactions.service';
import { setActiveChainKeyCookie } from '@/lib/chain-selection';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';

afterEach(() => { cleanup(); document.cookie = 'gf_chain=; max-age=0; path=/'; restoreHttpBoundary(); });
const tx = (hash: string, height: string) => ({ txhash: hash, height, code: 0 });
const response = (rows: ReturnType<typeof tx>[], total = String(rows.length)) => ({ tx_responses: rows, txs: [], pagination: null, total });
const links = () => screen.getAllByRole('link').map(link => link.textContent?.split('Height:')[0]);
function sdkPage(url: URL, rows: ReturnType<typeof tx>[]) {
  // SDK defaults to page 1/limit 100 if the non-deprecated fields are absent.
  const page = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 100);
  return response(rows.slice((page - 1) * limit, page * limit), String(rows.length));
}

it('SDK sender 101 rows reaches all pages; latest recipient and hash duplicate are preserved', async () => {
  const requests: URL[] = [];
  mockQueryHttp(url => { requests.push(url); return sdkPage(url, url.searchParams.get('query')?.includes('message.sender')
    ? Array.from({ length: 101 }, (_, i) => tx(`S${i}`, String(101 - i))) : [tx('NEWEST', '102'), tx('S0', '101')]); });
  render(<AddressTransactions address="sdk-101" />);
  await screen.findByText('NEWEST');
  for (const count of [60, 90, 101]) {
    fireEvent.click(screen.getByRole('button', { name: '송신 이어보기' }));
    await screen.findByText(`송신: 현재 조회 ${count}건 · 전체 개수 미확인`);
  }
  expect(links()).toEqual(['NEWEST', ...Array.from({ length: 101 }, (_, i) => `S${i}`)]);
  expect(screen.getAllByText('S0')).toHaveLength(1);
  expect(screen.getByRole('link', { name: /NEWEST/ }).getAttribute('href')).toBe('/tx/NEWEST?chain=fixture');
  expect(requests.map(url => [url.searchParams.get('page'), url.searchParams.get('limit')])).toEqual([['1', '30'], ['1', '30'], ['2', '30'], ['3', '30'], ['4', '30']]);
  expect(requests.every(url => !url.searchParams.has('pagination.key') && !url.searchParams.has('pagination.limit'))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '조회 정보' }));
  expect(within(screen.getByRole('region', { name: '송수신 조회 정보' })).getAllByText(/출처:/)).toHaveLength(5);
  expect(screen.queryByRole('button', { name: '송신 이어보기' })).toBeNull();
});

it('SDK 100/101 boundary also works at service page size 100', async () => {
  mockQueryHttp(url => sdkPage(url, Array.from({ length: 101 }, (_, i) => tx(`S${i}`, String(101 - i)))));
  const first = await getAddressTransactionsPage('sdk-101', 'sender', undefined, null, 100);
  expect(first.rows).toHaveLength(100); expect(first.nextCursor).toBe('2');
  const second = await getAddressTransactionsPage('sdk-101', 'sender', undefined, first.nextCursor, 100);
  expect(second.rows.map(row => row.hash)).toEqual(['S100']); expect(second.nextCursor).toBeNull();
  expect(first.totalVerified).toBe(false);
});

it('buffers equal and huge heights across both SDK streams and retries exactly the failed second page', async () => {
  const requests: string[] = []; let fail = true;
  const high = '9007199254740995', equal = '9007199254740993';
  const sender = [tx('DUP', '9007199254740994'), ...Array.from({ length: 29 }, (_, i) => tx(`S${String(i).padStart(2, '0')}`, equal)), tx('A', equal), tx('LOW', '1')];
  const recipient = [tx('NEW', high), tx('DUP', '9007199254740994'), ...Array.from({ length: 28 }, (_, i) => tx(`R${String(i).padStart(2, '0')}`, equal)), tx('B', equal)];
  mockQueryHttp(url => {
    const s = url.searchParams.get('query')?.includes('message.sender');
    const page = url.searchParams.get('page'); requests.push(`${s ? 's' : 'r'}:${page}`);
    if (s && page === '2' && fail) return new Response('', { status: 500 });
    return sdkPage(url, s ? sender : recipient);
  });
  render(<AddressTransactions address="boundary" />);
  await screen.findByText('NEW'); expect(links()).toEqual(['NEW', 'DUP']);
  fireEvent.click(screen.getByRole('button', { name: '수신 이어보기' }));
  await screen.findByText('수신: 현재 조회 31건 · 전체 개수 미확인');
  expect(links()).toEqual(['NEW', 'DUP']);
  fireEvent.click(screen.getByRole('button', { name: '송신 이어보기' }));
  await screen.findByText(/HTTP 500/);
  expect(screen.getByText('NEW')).toBeTruthy(); expect(screen.getByText('S00')).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: '송신 추가 조회 재시도' }));
  await screen.findByText('LOW');
  expect(links()).toEqual(['NEW', 'DUP', 'A', 'B', ...Array.from({ length: 28 }, (_, i) => `R${String(i).padStart(2, '0')}`), ...Array.from({ length: 29 }, (_, i) => `S${String(i).padStart(2, '0')}`), 'LOW']);
  expect(requests).toEqual(['s:1', 'r:1', 'r:2', 's:2', 's:2']);
});

it.each(['success', 'failure'])('retains successful recipient before/during/after delayed sender retry: %s', async outcome => {
  let attempts = 0, release!: (value: Response) => void;
  const requests: string[] = [];
  mockQueryHttp(url => {
    const s = url.searchParams.get('query')?.includes('message.sender'); requests.push(`${s ? 's' : 'r'}:${url.searchParams.get('page')}`);
    if (!s) return response([tx('RECIPIENT', '3')]);
    if (++attempts === 1) return new Response('', { status: 500 });
    return new Promise<Response>(resolve => { release = resolve; });
  });
  render(<AddressTransactions address="retry" />);
  await screen.findByText('RECIPIENT');
  fireEvent.click(within(screen.getByRole('region', { name: '송수신 조회 정보' })).getByRole('button', { name: '송신 다시 조회' }));
  await waitFor(() => expect(release).toBeTypeOf('function'));
  expect(screen.getByText('RECIPIENT')).toBeTruthy();
  expect(screen.getByText(/송수신 일부 범위만/)).toBeTruthy();
  await act(async () => release(outcome === 'success' ? Response.json(response([tx('SENDER', '2')])) : new Response('', { status: 500 })));
  expect(screen.getByText('RECIPIENT')).toBeTruthy();
  if (outcome === 'success') { expect(links()).toEqual(['RECIPIENT', 'SENDER']); expect(screen.queryByText(/송수신 일부 범위만/)).toBeNull(); }
  else { expect(screen.getByText(/송수신 일부 범위만/)).toBeTruthy(); expect(screen.getByText(/HTTP 500/)).toBeTruthy(); }
  expect(requests).toEqual(['s:1', 'r:1', 's:1']);
});

it.each(['address', 'chain'])('clears exposed partial rows on %s change and discards delayed recovery', async transition => {
  let attempts = 0, release!: (value: Response) => void; const requests: URL[] = [];
  mockQueryHttp(url => {
    requests.push(url);
    if (url.hostname === 'other.example.test' || url.searchParams.get('query')?.includes('new')) return response([tx('NEW', '1')]);
    if (url.searchParams.get('query')?.includes('transfer.recipient')) return response([tx('OLD', '3')]);
    if (++attempts === 1) return new Response('', { status: 500 });
    return new Promise<Response>(resolve => { release = resolve; });
  });
  vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ key: 'fixture', name: 'Fixture', lcdUrl: 'https://lcd.example.test' }, { key: 'other', name: 'Other', lcdUrl: 'https://other.example.test' }]));
  const view = render(<AddressTransactions address="old" />);
  await screen.findByText('OLD');
  fireEvent.click(within(screen.getByRole('region', { name: '송수신 조회 정보' })).getByRole('button', { name: '송신 다시 조회' }));
  await waitFor(() => expect(release).toBeTypeOf('function'));
  if (transition === 'address') view.rerender(<AddressTransactions address="new" />);
  else act(() => setActiveChainKeyCookie('other'));
  expect(screen.queryByText('OLD')).toBeNull();
  await screen.findByText('NEW');
  await act(async () => release(Response.json(response([tx('LATE', '9')]))));
  expect(screen.queryByText('LATE')).toBeNull(); expect(screen.queryByText(/송수신 일부 범위만/)).toBeNull();
  expect(requests.slice(-2).map(url => url.searchParams.get('page'))).toEqual(['1', '1']);
});

it.each([undefined, 'bad', '0', '100'])('labels unknown/inconsistent SDK pagination as partial while preserving rows (total=%s)', async total => {
  mockQueryHttp(() => ({ tx_responses: [tx('VISIBLE', '1')], pagination: null, total }));
  render(<AddressTransactions address="unknown" />);
  await screen.findByText('VISIBLE');
  expect(screen.getAllByText(/거래 페이지 계약을 확인할 수 없어/)).toHaveLength(2);
  expect(screen.queryByText(/현재 조회 조건에서 다음 페이지/)).toBeNull();
  expect(screen.queryByRole('button', { name: '송신 이어보기' })).toBeNull();
});

it('SDK total=0 empty streams show successful empty range', async () => {
  mockQueryHttp(() => response([])); render(<AddressTransactions address="empty" />);
  await screen.findByText('조회 범위에 거래가 없습니다.'); expect(screen.queryByText(/송수신 일부 범위만/)).toBeNull();
});
