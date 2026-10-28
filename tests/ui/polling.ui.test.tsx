// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TestIntlProvider, act, cleanup, fireEvent, render, screen } from '../helpers/render';
import { useQuery } from '@/hooks/use-query';
import { QueryStatus } from '@/components/query/query-status';
import { BlocksLiveList } from '@/components/explorer/blocks-live-list';
import { TransactionsLiveList } from '@/components/explorer/transactions-live-list';
import { setActiveChainKeyCookie } from '@/lib/chain-selection';
import { block, mockQueryHttp } from '../helpers/query-http';

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T00:00:00Z')); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); document.cookie = 'gf_chain=; max-age=0; path=/'; });
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
function visibility(value: string) { act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value }); document.dispatchEvent(new Event('visibilitychange')); }); }
function Probe({ target = 'probe', poll = 3000 }: { target?: string; poll?: number }) {
  const query = useQuery(target, client => client.lcdGet<{ height: string }>('/cosmos/base/tendermint/v1beta1/blocks/latest').then(value => value), poll);
  return <><QueryStatus {...query} /><span>{query.paused ? 'paused' : 'running'}</span></>;
}
it('AC07-1: a 10s response has one active cycle; manual refresh coalesces and schedule starts at completion', async () => {
  let active = 0, max = 0;
  const http = mockQueryHttp(() => new Promise(resolve => { active++; max = Math.max(max, active); setTimeout(() => { active--; resolve(block('1')); }, 10000); }));
  const view = render(<Probe />);
  await tick(9000);
  fireEvent.click(screen.getByRole('button')); await tick(1000);
  expect(http).toHaveBeenCalledTimes(1); expect(max).toBe(1);
  await tick(2999); expect(http).toHaveBeenCalledTimes(1);
  await tick(1); expect(http).toHaveBeenCalledTimes(2);
  view.unmount();
});
it('AC07-2: hidden aborts, suppresses automatic calls, resumes once after an abort-ignoring response, and stops on unmount', async () => {
  let finish!: (value: unknown) => void;
  const http = mockQueryHttp(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<Probe />);
  const signal = http.mock.calls[0][1]?.signal;
  visibility('hidden'); expect(signal?.aborted).toBe(true);
  await tick(20000); expect(http).toHaveBeenCalledTimes(1);
  visibility('visible'); visibility('visible'); expect(http).toHaveBeenCalledTimes(1);
  http.mockResolvedValue(Response.json(block('2')));
  await act(async () => finish(block('1'))); await tick();
  expect(http).toHaveBeenCalledTimes(2);
  view.unmount(); await tick(12000); expect(http).toHaveBeenCalledTimes(2);
});
it('does not load an initially hidden list and keeps the last success while paused', async () => {
  visibility('hidden'); const http = mockQueryHttp(() => block('1'));
  render(<BlocksLiveList />); await tick(9000); expect(http).toHaveBeenCalledTimes(0);
  visibility('visible'); await tick(); expect(screen.getByText('#1')).toBeTruthy();
  const calls = http.mock.calls.length;
  visibility('hidden'); await tick(9000); expect(http).toHaveBeenCalledTimes(calls);
  expect(screen.getByText('#1')).toBeTruthy(); expect(screen.getByText('일시 중지: 숨긴 탭')).toBeTruthy();
});
it('coalesces repeated invalidations and manual retry until the cancelled cycle settles', async () => {
  let finish!: (value: unknown) => void;
  const http = mockQueryHttp(() => new Promise(resolve => { finish = resolve; }));
  render(<Probe />);
  const invalidation = () => window.dispatchEvent(new CustomEvent('explorer:queries-invalidated', { detail: { chain: 'fixture', targets: ['probe'] } }));
  act(() => { invalidation(); invalidation(); });
  fireEvent.click(screen.getByRole('button'));
  expect(http).toHaveBeenCalledTimes(1); expect(http.mock.calls[0][1]?.signal?.aborted).toBe(true);
  http.mockResolvedValue(Response.json(block('2')));
  await act(async () => finish(block('1'))); await tick();
  expect(http).toHaveBeenCalledTimes(2); expect(screen.getByText('조회 완료')).toBeTruthy();
});
it('old target and chain completions cannot clear the new active request or its busy state', async () => {
  const finishes: ((response: unknown) => void)[] = [];
  const http = mockQueryHttp(() => new Promise(resolve => finishes.push(resolve)));
  vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ key: 'fixture', name: 'Fixture', lcdUrl: 'https://lcd.example.test' }, { key: 'second', name: 'Second', lcdUrl: 'https://second.example.test' }]));
  const view = render(<Probe target="old" />);
  view.rerender(<Probe target="new" />);
  await act(async () => finishes[0](block('1')));
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  act(() => setActiveChainKeyCookie('second'));
  await act(async () => finishes[1](block('2')));
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  await tick(9000); expect(http).toHaveBeenCalledTimes(3);
  await act(async () => finishes[2](block('3')));
  expect(screen.getByText(/second · new/)).toBeTruthy();
});
it('AC07-4: keeps stale data across 3 failures, uses 3/6/12/30 seconds, and resets after recovery', async () => {
  const http = mockQueryHttp(() => block('1'));
  render(<BlocksLiveList />); await tick();
  const observed = screen.getByText(/마지막 API 성공:/).textContent;
  http.mockResolvedValue(new Response('', { status: 503 }));
  fireEvent.click(screen.getByRole('button', { name: '목록 다시 조회' })); await tick();
  const calls = http.mock.calls.length;
  for (const [i, delay] of [3000, 6000, 12000, 30000].entries()) {
    expect(screen.getByText('갱신 실패 · 오래된 데이터')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText(/마지막 API 성공:/).textContent).toBe(observed);
    await tick(delay - 1); expect(http.mock.calls.length).toBe(calls + i);
    await tick(1); expect(http.mock.calls.length).toBe(calls + i + 1);
  }
  http.mockResolvedValue(Response.json(block('1'))); await tick(30000);
  expect(screen.getByText('조회 복구')).toBeTruthy();
  expect(screen.getByText(/마지막 API 성공:/).textContent).not.toBe(observed);
  http.mockResolvedValue(new Response('', { status: 503 }));
  fireEvent.click(screen.getByRole('button', { name: '목록 다시 조회' })); await tick();
  expect(screen.getByRole('button', { name: '목록 다시 조회' }).textContent).toContain('3초');
});
it.each(['20', 'Wed, 21 Oct 2026 00:00:20 GMT'])('honors 429 Retry-After %s across retry, visibility and invalidation', async retry => {
  const http = mockQueryHttp(() => new Response('', { status: 429, headers: { 'Retry-After': retry } }));
  render(<Probe />); await tick();
  fireEvent.click(screen.getByRole('button')); visibility('hidden'); visibility('visible');
  act(() => window.dispatchEvent(new CustomEvent('explorer:queries-invalidated', { detail: { chain: 'fixture', targets: ['probe'] } })));
  await tick(19000); expect(http).toHaveBeenCalledTimes(1);
  http.mockResolvedValue(Response.json(block('1'))); await tick(1000); expect(http).toHaveBeenCalledTimes(2);
});
it.each([
  { status: 503, retry: undefined },
  { status: 429, retry: '20' },
].flatMap(error => ['automatic', 'manual', 'visibility', 'invalidation'].map(trigger => ({ ...error, trigger }))))(
  'AC07-4: batch $status/$retry + 429/60 respects the longest deadline through $trigger',
  async ({ status, retry, trigger }) => {
    let height = 1, failing = false, cycles = 0;
    const atHeight = (h: number) => ({ ...block('1'), block: { ...block('1').block, header: { ...block('1').block.header, height: String(h) } } });
    const http = mockQueryHttp(url => {
      if (url.pathname.endsWith('/latest')) { cycles++; return atHeight(height); }
      const h = Number(url.pathname.split('/').at(-1));
      if (failing && h === 11) return new Response('', { status, headers: retry ? { 'Retry-After': retry } : {} });
      if (failing && h === 10) return new Response('', { status: 429, headers: { 'Retry-After': '60' } });
      return atHeight(h);
    });
    render(<BlocksLiveList />); await tick();
    const observed = screen.getByText(/마지막 API 성공:/).textContent;
    height = 11; failing = true;
    await tick(3000);
    expect(cycles).toBe(2);
    expect(screen.getByText('갱신 실패 · 오래된 데이터')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.queryByText('#11')).toBeNull();
    expect(screen.getByText(/마지막 API 성공:/).textContent).toBe(observed);
    expect(screen.getByRole('button', { name: '목록 다시 조회' }).textContent).toContain('60초');
    const calls = http.mock.calls.length;
    if (trigger === 'manual') fireEvent.click(screen.getByRole('button', { name: '목록 다시 조회' }));
    if (trigger === 'visibility') { visibility('hidden'); visibility('visible'); visibility('visible'); }
    if (trigger === 'invalidation') act(() => {
      for (let i = 0; i < 2; i++) window.dispatchEvent(new CustomEvent('explorer:queries-invalidated', { detail: { chain: 'fixture', targets: ['blocks'] } }));
    });
    await tick(59999);
    expect(cycles).toBe(2); expect(http).toHaveBeenCalledTimes(calls);
    expect(screen.queryByText('조회 완료')).toBeNull();
    failing = false; await tick(1);
    expect(cycles).toBe(3); expect(screen.getByText('조회 복구')).toBeTruthy();
    expect(screen.getByText(/마지막 API 성공:/).textContent).toContain('높이 11');
    for (let h = 1; h <= 11; h++) expect(screen.getByText(`#${h}`)).toBeTruthy();
    const recoveredCalls = http.mock.calls.length;
    await tick(2999); expect(cycles).toBe(3);
    await tick(1); expect(cycles).toBe(4); expect(http).toHaveBeenCalledTimes(recoveredCalls + 1);
  },
);
it('timeout is an error after 10s, while cancellation does not count as a failure', async () => {
  const http = mockQueryHttp(() => block('1'));
  http.mockImplementation((_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')))));
  render(<Probe />); await tick(10000);
  expect(screen.getByText(/조회 제한 시간.*timeout/)).toBeTruthy();
  expect(screen.getByRole('button').textContent).toContain('3초');
});
it('AC07-3: Blocks DOM restores 60-height gap, shows exact bounded range and preserves rows on partial failure', async () => {
  let height = 100, fail = false;
  mockQueryHttp(url => {
    const h = url.pathname.endsWith('/latest') ? height : Number(url.pathname.split('/').at(-1));
    if (fail && h === 155) return new Response('', { status: 503 });
    return { ...block('1'), block: { ...block('1').block, header: { ...block('1').block.header, height: String(h) } } };
  });
  render(<BlocksLiveList />); await tick(); expect(screen.getByText('#100')).toBeTruthy();
  height = 160; fail = true; await tick(3000);
  expect(screen.getByText('#100')).toBeTruthy(); expect(screen.queryByText('#160')).toBeNull();
  fail = false; await tick(3000);
  for (let h = 101; h <= 160; h++) expect(screen.getByText(`#${h}`)).toBeTruthy();
  expect(screen.getByText(/조회 범위 #61–#160/)).toBeTruthy();
  expect(screen.queryByText('#60')).toBeNull();
});
it('AC07-5: empty Transactions tracks block height independently of rows and skips unchanged scans', async () => {
  let height = 150;
  const http = mockQueryHttp(url => url.pathname.endsWith('/latest') ? { ...block('1'), block: { ...block('1').block, header: { ...block('1').block.header, height: String(height) } } } : { tx_responses: [], txs: [], total: '0' });
  render(<TransactionsLiveList />); await tick(); expect(http).toHaveBeenCalledTimes(31);
  expect(screen.getByText('최근 조회 범위에서 트랜잭션이 없습니다.')).toBeTruthy();
  expect(screen.getByText(/마지막 API 성공:.*높이 150/)).toBeTruthy();
  await tick(3000); expect(http).toHaveBeenCalledTimes(32);
  expect(screen.getByText(/직전 성공 조회와 높이 동일/)).toBeTruthy();
  height++; await tick(3000); expect(http).toHaveBeenCalledTimes(34);
  expect(screen.getByText(/높이 151/)).toBeTruthy();
});
it('invalidation keeps the visible blocks but reloads the same height without the old cursor', async () => {
  let finish!: (value: Response) => void;
  const http = mockQueryHttp(() => block('1'));
  render(<BlocksLiveList />); await tick();
  expect(http).toHaveBeenCalledTimes(2);
  http.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  act(() => window.dispatchEvent(new CustomEvent('explorer:queries-invalidated', { detail: { chain: 'fixture', targets: ['blocks'] } })));
  expect(screen.getByText('#1')).toBeTruthy();
  expect(screen.getByText('불러오는 중 · 갱신 중')).toBeTruthy();
  await act(async () => finish(Response.json(block('1')))); await tick();
  // latest + the block itself must both be requested despite unchanged height.
  expect(http).toHaveBeenCalledTimes(4);
  expect(screen.getByText('#1')).toBeTruthy();
});
it('expired Retry-After falls back to backoff instead of immediate request loops', async () => {
  const http = mockQueryHttp(() => new Response('', { status: 429, headers: { 'Retry-After': 'Tue, 20 Oct 2026 00:00:00 GMT' } }));
  render(<Probe />); await tick(2999); expect(http).toHaveBeenCalledTimes(1);
  await tick(1); expect(http).toHaveBeenCalledTimes(2);
  await tick(5999); expect(http).toHaveBeenCalledTimes(2);
});
it('non-poll queries retain the last result when disabled/re-enabled and still refresh manually', async () => {
  function Read({ enabled }: { enabled: boolean }) {
    const query = useQuery('retained', client => client.lcdGet('/balances/a'), undefined, enabled);
    return <QueryStatus {...query} />;
  }
  const http = mockQueryHttp(() => ({ balances: [] }));
  const view = render(<Read enabled />); await tick();
  const time = screen.getByText(/조회 시각:/).textContent;
  view.rerender(<Read enabled={false} />); expect(screen.getByText('미조회')).toBeTruthy();
  http.mockResolvedValue(new Response('', { status: 503 }));
  view.rerender(<Read enabled />); await tick();
  expect(screen.getByText('갱신 실패: 마지막 조회 데이터')).toBeTruthy();
  expect(screen.getByText(/조회 시각:/).textContent).toBe(time);
  fireEvent.click(screen.getByRole('button')); await tick(); expect(http).toHaveBeenCalledTimes(3);
});
it('server-rendered polling markup does not claim success before effects run', async () => {
  mockQueryHttp(() => block('1'));
  const { renderToString } = await import('react-dom/server');
  const markup = renderToString(<TestIntlProvider><BlocksLiveList /></TestIntlProvider>);
  expect(markup).toContain('불러오는 중');
  expect(markup).not.toContain('조회 완료');
});
