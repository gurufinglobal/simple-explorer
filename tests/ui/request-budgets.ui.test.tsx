// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '../helpers/render';
import AddressDetailPage from '@/app/(explorer)/address/[address]/page';
import { TransactionsLiveList } from '@/components/explorer/transactions-live-list';
import { useQuery } from '@/hooks/use-query';
import { fixtureAddress, mockQueryHttp } from '../helpers/query-http';
const route = vi.hoisted(() => ({ address: 'guru1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpk053t3' }));
vi.mock('next/navigation', () => ({ useParams: () => route, useSearchParams: () => new URLSearchParams() }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(['en', 'ko'] as const)('actual address route labels incomplete balances and never displays a full or zero balance (%s)', async locale => {
  let pages = 0;
  const http = mockQueryHttp(url => {
    if (url.pathname.includes('/denoms_metadata')) return { metadatas: [] };
    if (url.pathname.endsWith('/params')) return { params: { bond_denom: 'agxn', unbonding_time: '1s' } };
    if (url.pathname.includes('/balances/')) return { balances: [{ denom: 'agxn', amount: '999' }], pagination: { next_key: String(++pages) } };
    if (url.pathname.includes('/accounts/')) return { account: { account_number: '1', sequence: '1' } };
    if (url.pathname.includes('/unbonding_delegations')) return { unbonding_responses: [] };
    if (url.pathname.includes('/delegations/')) return { delegation_responses: [] };
    if (url.pathname.endsWith('/rewards')) return { total: [] };
    if (url.pathname.endsWith('/txs')) return { tx_responses: [], total: '0' };
    throw new Error(url.pathname);
  });
  render(<AddressDetailPage />, { locale });
  await waitFor(() => expect(screen.getAllByText(locale === 'en' ? /full total is unavailable/ : /전체 합계를 확인할 수 없습니다/).length).toBeGreaterThan(0));
  expect(screen.queryByText(/999/)).toBeNull();
  expect(screen.queryByText(locale === 'en' ? /Balance query complete: no coins held/ : /잔액 조회 완료: 보유 코인 없음/)).toBeNull();
  // Direct bank and portfolio consumers use the same in-flight pagination requests.
  expect(http.mock.calls.filter(([url]) => String(url).includes(`/balances/${fixtureAddress}`))).toHaveLength(50);
});
it.each(['en', 'ko'] as const)('actual transactions list exposes the bounded searched range (%s)', async locale => {
  const http = mockQueryHttp(url => url.pathname.endsWith('/latest') ? { block: { header: { height: '150', time: '2026-01-01T00:00:00Z' }, data: { txs: [] } } } : { tx_responses: [], total: '0' });
  render(<TransactionsLiveList />, { locale });
  expect(await screen.findByText(locale === 'en' ? /At most 30 heights and 30 seconds/ : /사이클당 최대 30개 높이·30초/)).toHaveProperty('textContent', expect.stringContaining('#121–#150'));
  expect(http).toHaveBeenCalledTimes(31);
});
function Poller({ name }: { name: string }) {
  const query = useQuery(name, client => client.lcdGet(`/probe/${name}`), 3000);
  return <span>{query.result.status}</span>;
}
it('two hook consumers recover at different jitter times after the same Retry-After minimum', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);
  let failed = true;
  const http = mockQueryHttp(() => failed ? new Response('', { status: 429, headers: { 'Retry-After': '20' } }) : { ok: true });
  render(<><Poller name="a" /><Poller name="b" /></>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(http).toHaveBeenCalledTimes(2); failed = false;
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); }); expect(http).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(200); }); expect(http).toHaveBeenCalledTimes(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(600); }); expect(http).toHaveBeenCalledTimes(4);
});
