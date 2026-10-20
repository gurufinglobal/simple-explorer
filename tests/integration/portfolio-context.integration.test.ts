import { afterEach, describe, expect, it } from 'vitest';
import { useWalletPortfolioStore } from '@/stores/wallet-portfolio.store';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
afterEach(() => { useWalletPortfolioStore.getState().clear(); restoreHttpBoundary(); });
describe('portfolio context through the HTTP boundary', () => {
  it('clears previous account data and discards late responses after clear', async () => {
    const http = mockQueryHttp(url => url.pathname.includes('/balances/') ? { balances: [{ denom: 'agxn', amount: '1000000000000000000' }] } : url.pathname.includes('/rewards') ? { total: [] } : url.pathname.includes('/unbonding') ? { unbonding_responses: [] } : { delegation_responses: [] });
    await useWalletPortfolioStore.getState().refresh('a');
    expect(useWalletPortfolioStore.getState().balance).toBe('1 gxn');
    const resolvers: ((response: Response) => void)[] = [];
    http.mockImplementation(() => new Promise(resolve => { resolvers.push(resolve); }));
    const pending = useWalletPortfolioStore.getState().refresh('b');
    expect(useWalletPortfolioStore.getState()).toMatchObject({ balance: '—', result: { context: { target: 'portfolio:b' }, status: 'loading' } });
    useWalletPortfolioStore.getState().clear();
    resolvers.forEach(resolve => resolve(Response.json({ balances: [], delegation_responses: [], total: [], unbonding_responses: [] })));
    await pending;
    expect(useWalletPortfolioStore.getState()).toMatchObject({ balance: '—', result: { status: 'idle', data: null } });
  });
  it('keeps last success after a refresh fails', async () => {
    const http = mockQueryHttp(url => url.pathname.includes('/balances/') ? { balances: [] } : url.pathname.includes('/rewards') ? { total: [] } : url.pathname.includes('/unbonding') ? { unbonding_responses: [] } : { delegation_responses: [] });
    await useWalletPortfolioStore.getState().refresh('a');
    const observedAt = useWalletPortfolioStore.getState().result.observedAt;
    http.mockResolvedValue(new Response('', { status: 500 }));
    await useWalletPortfolioStore.getState().refresh('a');
    expect(useWalletPortfolioStore.getState()).toMatchObject({ balance: '0 gxn', result: { status: 'stale', observedAt, error: { status: 500 } } });
  });
});
