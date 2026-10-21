// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PathParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import AddressDetailPage from '@/app/(explorer)/address/[address]/page';
import { mockQueryHttp, fixtureAddress } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
afterEach(() => { cleanup(); restoreHttpBoundary(); });
function show() {
  return render(<PathParamsContext.Provider value={{ address: fixtureAddress }}><AddressDetailPage /></PathParamsContext.Provider>);
}
function fixture(path: string) {
  if (path.includes('/auth/')) return { account: { account_number: '1', sequence: '2' } };
  if (path.includes('/txs')) return { tx_responses: [], txs: [] };
  return { balances: [{ denom: 'agxn', amount: '0' }] };
}
describe('address page distinguishes query outcomes on the same screen', () => {
  it('renders a real zero separately from confirmed account absence and an empty transaction range', async () => {
    mockQueryHttp(url => url.pathname.includes('/auth/') ? Response.json({ code: 5, message: 'account fixture-address not found' }, { status: 404 }) : fixture(url.pathname));
    show();
    expect(await screen.findByText('0 agxn')).toBeTruthy();
    expect(await screen.findByText('확인된 미존재')).toBeTruthy();
    expect(await screen.findByText('조회 범위에 거래가 없습니다.')).toBeTruthy();
  });
  it('renders a valid empty bank result', async () => {
    mockQueryHttp(url => url.pathname.includes('/balances/') ? { balances: [] } : fixture(url.pathname));
    show(); expect(await screen.findByText('잔액 조회 완료: 보유 코인이 없습니다.')).toBeTruthy();
  });
  it.each(['500', 'timeout', 'parse', 'schema'])('keeps %s distinct from zero/empty while showing successful account data', async kind => {
    mockQueryHttp(url => {
      if (!url.pathname.includes('/balances/')) return fixture(url.pathname);
      if (kind === '500') return new Response('', { status: 500 });
      if (kind === 'timeout') throw new DOMException('timed out', 'TimeoutError');
      if (kind === 'parse') return new Response('invalid json');
      return { balances: [{}] };
    });
    show();
    expect(await screen.findAllByText('조회 실패')).toBeTruthy();
    expect(screen.getAllByText(new RegExp(kind === '500' ? 'HTTP 500' : `\\(${kind}\\)`))).toBeTruthy();
    expect(await screen.findByText('Account Number: 1')).toBeTruthy();
    expect(screen.queryByText('0 agxn')).toBeNull();
    expect(screen.queryByText('잔액 조회 완료: 보유 코인이 없습니다.')).toBeNull();
  });
});
