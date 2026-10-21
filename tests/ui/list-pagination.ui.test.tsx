// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import OperationsPage from '@/app/(explorer)/operations/page';
import StakingPage from '@/app/(explorer)/staking/page';
import GovernancePage from '@/app/(explorer)/governance/page';
import GovernanceDetail from '@/app/(explorer)/governance/[proposalId]/page';
import { DashboardView } from '@/components/network/dashboard-view';
import { TokensMetadataList } from '@/components/tokens/tokens-metadata-list';
import { setActiveChainKeyCookie } from '@/lib/chain-selection';
import { mockQueryHttp } from '../helpers/query-http';
import { amountResponse } from '../helpers/amounts';
import { restoreHttpBoundary, mockNetworkSummaryHttp } from '../helpers/network-summary';

afterEach(() => { cleanup(); document.cookie = 'gf_chain=; max-age=0; path=/'; restoreHttpBoundary(); });
const cursor = 'a+/==&?';
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
const showStaking = () => render(<AppRouterContext.Provider value={router}><StakingPage /></AppRouterContext.Provider>);
const channel = (n: number) => ({ port_id: 'transfer', channel_id: `channel-${n}`, state: 'STATE_OPEN' });
const validator = (n: number) => ({ operator_address: `operator-${n}`, description: { moniker: `Validator ${n}` }, tokens: '100', status: 'BOND_STATUS_BONDED' });
const proposal = (n: number) => ({ id: String(n), title: `Proposal ${n}`, status: 'PROPOSAL_STATUS_PASSED' });
const pagination = (next: string | null) => ({ next_key: next, total: '0' });

describe('W09 actual route/service pagination', () => {
  it('IBC 101 rows survives total=0; encoded cursor fails then retries without erasing 100 rows', async () => {
    let fail = true;
    const requests: (string | null)[] = [];
    mockQueryHttp(url => {
      const key = url.searchParams.get('pagination.key'); requests.push(key);
      if (key && fail) return new Response('', { status: 500 });
      return { channels: key ? [channel(101)] : Array.from({ length: 100 }, (_, i) => channel(i + 1)), pagination: pagination(key ? null : cursor) };
    });
    render(<OperationsPage />);
    await screen.findByText('channel-100');
    expect(screen.getByText('목록: 현재 조회 100건 · 전체 개수 미확인')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '목록 이어보기' }));
    await screen.findByText(/HTTP 500/);
    expect(screen.getByText('channel-1')).toBeTruthy();
    expect(screen.queryByText('조회 완료: 빈 결과')).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '목록 추가 조회 재시도' }));
    await screen.findByText('channel-101');
    expect(requests).toEqual([null, cursor, cursor]);
    expect(screen.getByText('목록: 현재 조회 101건 · 전체 개수 미확인')).toBeTruthy();
  });
  it('keeps a prior malformed-page warning through a later transport failure and successful retry', async () => {
    let fail = true;
    mockQueryHttp(url => url.searchParams.has('pagination.key') ? fail ? new Response('', { status: 500 }) : { channels: [channel(2)], pagination: pagination(null) } : { channels: [channel(1), { port_id: '', channel_id: '' }], pagination: pagination(cursor) });
    render(<OperationsPage />);
    await screen.findByText(/일부 채널의 식별자/);
    fireEvent.click(screen.getByRole('button', { name: '목록 이어보기' }));
    await screen.findByText(/HTTP 500/);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '목록 추가 조회 재시도' }));
    await screen.findByText('channel-2');
    expect(screen.getByText(/일부 채널의 식별자/)).toBeTruthy();
    expect(screen.queryByText(/현재 조회 조건에서 다음 페이지/)).toBeNull();
  });
  it('shows an explicit limit when a full page has no cursor metadata', async () => {
    mockQueryHttp(() => ({ channels: Array.from({ length: 100 }, (_, i) => channel(i)), pagination: { total: '0' } }));
    render(<OperationsPage />);
    await screen.findByText(/서버가 다음 cursor를 제공하지 않아/);
    expect(screen.queryByRole('button', { name: '목록 이어보기' })).toBeNull();
  });
  it.each(['empty', 'failure'])('distinguishes first IBC %s', async outcome => {
    mockQueryHttp(() => outcome === 'failure' ? new Response('', { status: 500 }) : { channels: [], pagination: pagination(null) });
    render(<OperationsPage />);
    await screen.findByText(outcome === 'failure' ? '조회 실패' : '조회 완료: 빈 결과');
    expect(!!screen.queryByText(/조회한 범위에 등록된 채널이 없습니다/)).toBe(outcome === 'empty');
  });
  it.each(['repeat', 'cycle', 'cap'])('stops IBC %s without claiming complete', async mode => {
    let page = 0;
    const count = mode === 'cap' ? 50 : mode === 'cycle' ? 3 : 2;
    const http = mockQueryHttp(() => { page++; return { channels: [channel(mode === 'cap' ? 1 : page)], pagination: pagination(mode === 'cap' ? String(page) : mode === 'cycle' && page === 2 ? 'b' : 'a') }; });
    render(<OperationsPage />);
    if (mode === 'cap') {
      // Retain one deduplicated row so this tests 50 real HTTP/UI page transitions,
      // without repeatedly traversing an ever-growing MUI table under suite load.
      const button = await screen.findByRole('button', { name: '목록 이어보기' }) as HTMLButtonElement;
      for (let i = 1; i < count; i++) {
        await waitFor(() => expect(button.disabled).toBe(false));
        fireEvent.click(button);
      }
      await screen.findByText(/조회 한도\(50페이지\)/);
    } else {
      for (let i = 1; i <= count; i++) {
        await screen.findByText(`channel-${i}`);
        if (i < count) fireEvent.click(screen.getByRole('button', { name: '목록 이어보기' }));
      }
    }
    expect(screen.getByText(mode === 'cap' ? /조회 한도\(50페이지\)/ : /cursor 반복·순환/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '목록 이어보기' })).toBeNull();
    expect(screen.queryByText(/현재 조회 조건에서 다음 페이지/)).toBeNull();
    expect(http).toHaveBeenCalledTimes(count);
  });
  it('aborts an old chain page, clears old rows/cursor, and discards its late success', async () => {
    let release!: (response: Response) => void;
    const http = mockQueryHttp(url => url.searchParams.has('pagination.key') ? new Promise<Response>(resolve => { release = resolve; }) : { channels: [channel(1)], pagination: pagination(cursor) });
    vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ key: 'fixture', name: 'Fixture', lcdUrl: 'https://lcd.example.test' }, { key: 'other', name: 'Other', lcdUrl: 'https://other.example.test' }]));
    render(<OperationsPage />);
    await screen.findByText('channel-1');
    fireEvent.click(screen.getByRole('button', { name: '목록 이어보기' }));
    const signal = http.mock.calls.at(-1)?.[1]?.signal;
    http.mockResolvedValue(Response.json({ channels: [channel(900)], pagination: pagination(null) }));
    act(() => setActiveChainKeyCookie('other'));
    expect(screen.queryByText('channel-1')).toBeNull();
    expect(signal?.aborted).toBe(true);
    await screen.findByText('channel-900');
    await act(async () => release(Response.json({ channels: [channel(2)], pagination: pagination(null) })));
    expect(screen.queryByText('channel-2')).toBeNull();
    expect(new URL(String(http.mock.calls.at(-1)?.[0])).searchParams.has('pagination.key')).toBe(false);
  });
  it('validators 21 keeps amounts and explicitly uses only the loaded population', async () => {
    mockQueryHttp(url => amountResponse(url) ?? { validators: url.searchParams.has('pagination.key') ? [validator(21)] : Array.from({ length: 20 }, (_, i) => validator(i + 1)), pagination: pagination(url.searchParams.has('pagination.key') ? null : cursor) });
    showStaking();
    await screen.findByText('Validator 20');
    expect(screen.getByText(/비율은 현재 조회 목록 내 비중/)).toBeTruthy();
    expect(screen.getAllByText(/5.00%/)).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: '목록 이어보기' }));
    await screen.findByText('Validator 21');
    expect(screen.getAllByText(/4.76%/)).toHaveLength(21);
    fireEvent.click(screen.getByText('Validator 21'));
    expect(router.push).toHaveBeenCalledWith('/staking/operator-21?chain=fixture');
    expect(screen.queryByText('체인 전체 비중')).toBeNull();
  });
  it('Dashboard 101 labels fetched bonded count separately from the chain pool', async () => {
    const http = mockNetworkSummaryHttp(), original = http.getMockImplementation()!;
    http.mockImplementation((input, init) => {
      const url = new URL(String(input));
      return url.pathname.endsWith('/validators') ? Promise.resolve(Response.json({ validators: url.searchParams.has('pagination.key') ? [validator(101)] : Array.from({ length: 100 }, (_, i) => validator(i + 1)), pagination: pagination(url.searchParams.has('pagination.key') ? null : cursor) })) : original(input, init);
    });
    render(<DashboardView />);
    await screen.findByText('검증자: 현재 조회 100건 · 전체 개수 미확인');
    expect(screen.getByText('현재 조회 bonded 검증자 수')).toBeTruthy();
    expect(screen.getByText('체인 staking pool 본딩량')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '검증자 이어보기' }));
    await screen.findByText('검증자: 현재 조회 101건 · 전체 개수 미확인');
  });
  it('does not present a failed proposal query as a successful empty filter', async () => {
    mockQueryHttp(() => new Response('', { status: 500 }));
    render(<GovernancePage />);
    expect(screen.queryByText('표시할 제안이 없습니다.')).toBeNull();
    await screen.findByText('조회 실패');
    expect(screen.getByText('제안 목록 미확인: 조회 상태를 확인하세요.')).toBeTruthy();
    expect(screen.queryByText('표시할 제안이 없습니다.')).toBeNull();
  });
  it('proposal 101 and filter change reset cursor while retaining selected local filter', async () => {
    const keys: (string | null)[] = [];
    mockQueryHttp(url => {
      keys.push(url.searchParams.get('pagination.key'));
      return { proposals: url.searchParams.has('pagination.key') ? [proposal(101)] : Array.from({ length: 100 }, (_, i) => proposal(i + 1)), pagination: pagination(url.searchParams.has('pagination.key') ? null : cursor) };
    });
    render(<GovernancePage />);
    await screen.findByText('Proposal 100');
    fireEvent.click(screen.getByRole('button', { name: '목록 이어보기' }));
    expect((await screen.findByRole('link', { name: /Proposal 101/ })).getAttribute('href')).toBe('/governance/101?chain=fixture');
    fireEvent.click(screen.getByRole('tab', { name: '가결' }));
    await screen.findByText('Proposal 100');
    expect(screen.queryByText('Proposal 101')).toBeNull();
    expect(screen.getByRole('tab', { name: '가결' }).getAttribute('aria-selected')).toBe('true');
    expect(keys).toEqual([null, cursor, null]);
    expect(screen.getByText(/필터와 정렬은 현재 조회 목록에만/)).toBeTruthy();
  });
  it('votes 201 uses encoded cursors through v1beta1 fallback on the real proposal screen', async () => {
    const keys: (string | null)[] = [];
    mockQueryHttp(url => {
      if (amountResponse(url)) return amountResponse(url);
      if (url.pathname.includes('/v1/')) return new Response('', { status: 404 });
      if (url.pathname.endsWith('/votes')) {
        keys.push(url.searchParams.get('pagination.key'));
        return { votes: url.searchParams.has('pagination.key') ? [{ voter: 'voter-201', option: 'VOTE_OPTION_YES' }] : Array.from({ length: 200 }, (_, i) => ({ voter: `voter-${i + 1}`, option: 'VOTE_OPTION_YES' })), pagination: pagination(url.searchParams.has('pagination.key') ? null : cursor) };
      }
      if (url.pathname.endsWith('/proposals/1')) return { proposal: { proposal_id: '1', content: { title: 'Legacy', description: 'Summary' }, status: 'PROPOSAL_STATUS_PASSED' } };
      if (url.pathname.endsWith('/deposits')) return { deposits: [] };
      if (url.pathname.endsWith('/tally')) return { tally: { yes: '1', no: '0', abstain: '0', no_with_veto: '0' } };
      if (url.pathname.endsWith('/voting')) return { voting_params: { voting_period: '120h' } };
      if (url.pathname.endsWith('/tallying')) return { tally_params: { quorum: '0.3', threshold: '0.5', veto_threshold: '0.3' } };
      return { deposit_params: { min_deposit: [] } };
    });
    render(<PathParamsContext.Provider value={{ proposalId: '1' }}><GovernanceDetail /></PathParamsContext.Provider>);
    await screen.findByText('voter-200');
    fireEvent.click(screen.getByRole('button', { name: '투표 이어보기' }));
    await screen.findByText('voter-201');
    expect(keys).toEqual([null, cursor]);
  });
  it.each(['cycle', 'cap', 'failure'])('Tokens shows %s as partial and keeps metadata', async mode => {
    let pages = 0;
    mockQueryHttp(() => { pages++; return mode === 'failure' && pages === 2 ? new Response('', { status: 500 }) : { metadatas: [{ base: `base${pages}`, symbol: `TOKEN${pages}` }], pagination: pagination(mode === 'cycle' ? 'same' : String(pages)) }; });
    render(<TokensMetadataList />);
    await screen.findByText('일부 조회 실패');
    expect(screen.getByText('TOKEN1')).toBeTruthy();
    expect(screen.getByText(mode === 'cycle' ? /Metadata cursor 반복/ : mode === 'cap' ? /Metadata 조회 한도/ : /HTTP 500/)).toBeTruthy();
    expect(pages).toBe(mode === 'cap' ? 50 : 2);
  });
});
