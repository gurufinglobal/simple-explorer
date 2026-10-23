// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '../helpers/render';
import { DashboardView } from "@/components/network/dashboard-view";
import { NetworkSummaryPanel } from '@/components/network/network-summary-panel';
import { BlocksLiveList } from '@/components/explorer/blocks-live-list';
import { TokensMetadataList } from '@/components/tokens/tokens-metadata-list';
import { useQuery } from '@/hooks/use-query';
import { QueryStatus } from '@/components/query/query-status';
import { getAddressBalances } from '@/services/guru/address-profile.service';
import { setActiveChainKeyCookie } from '@/lib/chain-selection';
import { block, mockQueryHttp } from '../helpers/query-http';
import { mockNetworkSummaryHttp, restoreHttpBoundary } from '../helpers/network-summary';
afterEach(() => { cleanup(); vi.useRealTimers(); document.cookie = 'gf_chain=; max-age=0; path=/'; restoreHttpBoundary(); });
function AddressRead({ address }: { address: string }) {
  const query = useQuery(`balance:${address}`, client => getAddressBalances(address, client));
  return <><QueryStatus {...query} />{query.result.data?.map(row => <span key={row.denom}>{row.amount} {row.denom}</span>)}</>;
}
describe('real service and query DOM', () => {
  it('shows HTTP polling state and preserves stale blocks after the retry deadline', async () => {
    vi.useFakeTimers();
    const http = mockQueryHttp(() => new Response('', { status: 500 }));
    render(<BlocksLiveList />);
    expect(screen.queryByText('조회한 블록이 없습니다.')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(/HTTP 500/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '목록 다시 조회' }) as HTMLButtonElement).disabled).toBe(true);
    http.mockImplementation(async () => Response.json(block('1')));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('조회 복구')).toBeTruthy();
    http.mockResolvedValue(new Response('', { status: 500 }));
    fireEvent.click(screen.getByRole('button', { name: '목록 다시 조회' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('갱신 실패: 마지막 조회 데이터')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('갱신 실패 · 오래된 데이터')).toBeTruthy();
  });
  it('keeps independent Dashboard account and validator metrics when summary fails', async () => {
    const http = mockNetworkSummaryHttp();
    const respond = http.getMockImplementation()!;
    http.mockImplementation((input, init) => {
      if (String(input).includes('/validators?')) return Promise.resolve(Response.json({ validators: [] }));
      if (String(input).includes('/accounts?') || String(input).endsWith('/node_info')) return respond(input, init);
      return Promise.resolve(new Response('', { status: 500 }));
    });
    render(<DashboardView />);
    expect(await screen.findByText('9,007,199,254,740,993')).toBeTruthy();
    expect(screen.getByText("검증자").parentElement?.textContent).toContain('0');
    expect(await screen.findByText('조회 실패')).toBeTruthy();
  });
  it('preserves successful metrics/time after refresh failure and marks stale', async () => {
    const http = mockNetworkSummaryHttp();
    render(<NetworkSummaryPanel />);
    expect(await screen.findByText('4.20%')).toBeTruthy();
    const timestamp = screen.getByText(/조회 시각:/).textContent;
    http.mockResolvedValue(new Response('', { status: 500 }));
    fireEvent.click(screen.getByRole('button', { name: '다시 조회' }));
    expect(await screen.findByText('갱신 실패: 마지막 조회 데이터')).toBeTruthy();
    expect(screen.getByText('4.20%')).toBeTruthy();
    expect(screen.getByText(/조회 시각:/).textContent).toBe(timestamp);
  });
  it('renders partial metrics instead of inflation zero', async () => {
    const http = mockNetworkSummaryHttp(); const respond = http.getMockImplementation()!;
    http.mockImplementation((input, init) => String(input).endsWith('/inflation') ? Promise.resolve(new Response('', { status: 500 })) : respond(input, init));
    render(<NetworkSummaryPanel />);
    expect(await screen.findByText('일부 조회 실패')).toBeTruthy();
    expect(screen.getByText('123456789.012345 GXN')).toBeTruthy();
    expect(screen.queryByText('0.00%')).toBeNull();
  });
  it('keeps metadata first page with a later page error', async () => {
    mockQueryHttp(url => url.searchParams.has('pagination.key') ? new Response('', { status: 500 }) : { metadatas: [{ base: 'agxn', symbol: 'GXN' }], pagination: { next_key: 'next' } });
    render(<TokensMetadataList />);
    expect(await screen.findByText('일부 조회 실패')).toBeTruthy();
    expect(screen.getByText('GXN')).toBeTruthy();
  });
  it('disables retry during a request and honors Retry-After', async () => {
    const http = mockQueryHttp(() => new Response('', { status: 429, headers: { 'Retry-After': '2' } }));
    render(<AddressRead address="a" />);
    const button = await screen.findByRole('button', { name: /초 후 재시도/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button); expect(http).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    vi.useRealTimers();
    // useNowTick's existing real interval updates the countdown after the deadline.
    await waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false), { timeout: 4000 });
    let resolve!: (response: Response) => void;
    http.mockImplementation(() => new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole('button'));
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button')); expect(http).toHaveBeenCalledTimes(2);
    await act(async () => resolve(Response.json({ balances: [] })));
    expect(screen.getByText('조회 완료: 빈 결과')).toBeTruthy();
  });
  it('clears a previous target synchronously and ignores its late response', async () => {
    let oldResolve!: (response: Response) => void;
    const http = mockQueryHttp(() => new Promise<Response>(done => { oldResolve = done; }));
    const view = render(<AddressRead address="old" />);
    const signal = http.mock.calls[0][1]?.signal;
    http.mockResolvedValue(Response.json({ balances: [{ denom: 'new', amount: '0' }] }));
    view.rerender(<AddressRead address="new" />);
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByText('0 new')).toBeTruthy();
    await act(async () => oldResolve(Response.json({ balances: [{ denom: 'old', amount: '99' }] })));
    expect(screen.queryByText('99 old')).toBeNull();
    expect(screen.getByText(/balance:new/)).toBeTruthy();
  });
  it('clears old chain data then shows a successful tgxn response', async () => {
    mockQueryHttp(() => ({ balances: [{ denom: 'old', amount: '9' }] }));
    vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ key: 'fixture', name: 'Fixture', lcdUrl: 'https://lcd.example.test' }, { key: 'tgxn', name: 'TGXN', lcdUrl: 'https://tgxn.example.test' }]));
    render(<AddressRead address="same" />);
    expect(await screen.findByText('9 old')).toBeTruthy();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ balances: [{ denom: 'tgxn', amount: '0' }] })));
    act(() => setActiveChainKeyCookie('tgxn'));
    expect(screen.queryByText('9 old')).toBeNull();
    expect(await screen.findByText('0 tgxn')).toBeTruthy();
    expect(screen.getByText(/조회 시각:.*tgxn/)).toBeTruthy();
  });
});
