// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PathParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import AddressDetailPage from '@/app/(explorer)/address/[address]/page';
import { TokensMetadataList } from '@/components/tokens/tokens-metadata-list';
import { mockQueryHttp } from '../helpers/query-http';
import { amountResponse } from '../helpers/amounts';
import { restoreHttpBoundary } from '../helpers/network-summary';
import observed from '../fixtures/tgxn-2026-10-20/metadata.json';
afterEach(() => { cleanup(); restoreHttpBoundary(); });
describe('AC02 amount details through the real service and DOM', () => {
  it('shows unknown precision for captured IBC rows while native GXN remains 18', async () => {
    mockQueryHttp(() => ({ ...observed.response, pagination: { next_key: null } }));
    render(<TokensMetadataList />);
    expect(await screen.findAllByText('정밀도 미확인')).toHaveLength(9);
    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getByText(observed.response.metadatas[1].display)).toBeTruthy();
  });
  it('wallet-free address exposes exact reward and unbonding entries, current duration and observed height', async () => {
    mockQueryHttp(url => amountResponse(url) ?? (
      url.pathname.includes('/balances/') ? { balances: [{ denom: 'agxn', amount: '1000000000000000000' }, { denom: 'unknown', amount: '9007199254740993' }] } :
      url.pathname.includes('/auth/') ? { account: { account_number: '1', sequence: '0' } } :
      url.pathname.includes('/txs') ? { tx_responses: [] } :
      url.pathname.includes('/rewards') ? { total: [{ denom: 'agxn', amount: '123.450000' }] } :
      url.pathname.includes('/unbonding') ? Response.json({ unbonding_responses: [{ validator_address: 'validator', entries: [{ balance: '10', completion_time: '2020-01-01T00:00:00Z' }, { balance: '20', completion_time: '2030-01-01T00:00:00Z' }] }] }, { headers: { 'x-cosmos-block-height': '42' } }) : { delegation_responses: [] }));
    render(<PathParamsContext.Provider value={{ address: 'any-public-address' }}><AddressDetailPage /></PathParamsContext.Provider>);
    expect(await screen.findByText('1 GXN')).toBeTruthy();
    expect(await screen.findByText('9007199254740993 unknown (정밀도 미확인)')).toBeTruthy();
    await screen.findByText(/합계 조회 기준 높이: 42/);
    expect(screen.getByText(/현재 unbonding 기간: 86400s/)).toBeTruthy();
    expect(screen.getByText(/2020-01-01T00:00:00Z/)).toBeTruthy();
    expect(screen.getByText(/2030-01-01T00:00:00Z/)).toBeTruthy();
    for (const button of screen.getAllByRole('button', { name: '원본 금액' })) fireEvent.click(button);
    expect(screen.getByText('123.450000 agxn')).toBeTruthy();
    expect(screen.getByText(/소수 최소 단위 보상: 전송 정수와 다릅니다/)).toBeTruthy();
    expect(screen.getByText(/시간이 지나도 수령 완료를 뜻하지 않습니다/)).toBeTruthy();
    expect(screen.getByText('30 agxn')).toBeTruthy();
  });
});
