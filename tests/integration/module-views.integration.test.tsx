// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PathParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import BexPage from '@/app/(explorer)/bex/page';
import BexDetail from '@/app/(explorer)/bex/[id]/page';
import OraclePage from '@/app/(explorer)/oracle/page';
import OracleDetail from '@/app/(explorer)/oracle/[requestId]/page';
import FeePage from '@/app/(explorer)/feepolicy/page';
import FeeDetail from '@/app/(explorer)/feepolicy/[address]/page';
import type { ChainConfig } from '@/lib/env';
const chains: ChainConfig[] = [
  { key: 'on', name: 'On fixture', lcdUrl: 'https://on.example', features: { bex: true, oracle: true, feepolicy: true } },
  { key: 'off', name: 'Off fixture', lcdUrl: 'https://off.example', features: { bex: false, oracle: false, feepolicy: false } },
];
const http = vi.fn<typeof fetch>();
const row = { id: '9007199254740993', fee: '0.006000000000000000', limit: '999999999999999999999999', nonce: '9007199254740993' };
const feeRow = { address: '', modules: [{ module: 'bank', discounts: [{ discount_type: 'percent', amount: '100.000000000000000000' }, { discount_type: 'percentage', amount: '0.000000000000000001' }] }] };
function body(path: string) {
  if (path.endsWith('/exchanges')) return { exchanges: [row] };
  if (path.endsWith('_fees')) return { coins: [] };
  if (path.endsWith('/requests')) return { requests: [row] };
  if (path.endsWith('/requests/1')) return { request: { ...row, id: '1' } };
  if (path.endsWith('/result')) return { result: { request_id: '1', nonce: '0', aggregated_time: '999999999999999999999' } };
  if (path.endsWith('/reports')) return { reports: [{ request_id: '1', provider: 'provider', nonce: '0', signature: 'unverified-signature', raw_data: '9007199254740993123' }] };
  if (path.endsWith('/results')) return { results: [] };
  if (path.endsWith('/params')) return { params: { enable: true } };
  if (path.endsWith('/categories')) return { categories: [] };
  if (path.endsWith('/whitelist')) return { addresses: [], count: '0' };
  if (path.endsWith('/moderator_address')) return { moderator_address: 'moderator' };
  if (path.endsWith('/discounts')) return { discounts: [feeRow] };
  throw new Error(path);
}
const route = (Page: React.ComponentType) => <PathParamsContext.Provider value={{ id: row.id, requestId: '1', address: 'ALL' }}><Page /></PathParamsContext.Provider>;
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify(chains)); vi.stubEnv('NEXT_PUBLIC_DEFAULT_CHAIN_KEY', 'on');
  window.history.replaceState(null, '', '/?chain=on');
  http.mockReset().mockImplementation(async input => Response.json(body(new URL(String(input)).pathname), { headers: { 'x-cosmos-block-height': '123' } }));
  vi.stubGlobal('fetch', http);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/'); });

it.each([BexPage, BexDetail, OraclePage, OracleDetail, FeePage, FeeDetail])('direct URL capability off issues zero requests: %s', async Page => {
  window.history.replaceState(null, '', '/?chain=off');
  render(route(Page));
  await waitFor(() => expect(screen.getAllByRole('alert').every(alert => alert.textContent?.includes('지원 설정'))).toBe(true));
  expect(http).not.toHaveBeenCalled();
});
describe.each([
  { name: 'bex', Page: BexPage, field: 'exchanges', value: row },
  { name: 'oracle', Page: OraclePage, field: 'requests', value: row },
  { name: 'feepolicy', Page: FeePage, field: 'discounts', value: feeRow },
])('$name list route states', ({ Page, field, value }) => {
  it.each([404, 500])('HTTP %s retry recovers and retains observation context', async status => {
    http.mockResolvedValueOnce(new Response('', { status }));
    render(route(Page));
    expect((await screen.findAllByRole('alert'))[0].textContent).toContain(`HTTP ${status}`);
    fireEvent.click(screen.getAllByRole('button', { name: '다시 조회' })[0]);
    await screen.findByRole('link', { name: field === 'discounts' ? 'ALL' : row.id });
    expect(screen.getAllByText(/응답 높이: 123/).length).toBeGreaterThan(0);
  });
  it('empty is distinct from malformed/partial; failed refresh keeps raw rows', async () => {
    http.mockImplementation(async input => Response.json({ ...body(new URL(String(input)).pathname), [field]: [] }));
    render(route(Page)); await screen.findAllByText('조회 완료: 빈 결과');
    http.mockResolvedValueOnce(Response.json({ [field]: [value, null] }));
    fireEvent.click(screen.getAllByRole('button', { name: '다시 조회' })[0]);
    // Existing successful empty snapshot is retained as stale on a malformed refresh.
    await screen.findByText('갱신 실패: 마지막 조회 데이터');
    cleanup();
    http.mockResolvedValueOnce(Response.json({ [field]: [value, null] }));
    render(route(Page)); await screen.findByText('일부 조회 실패');
    const link = await screen.findByRole('link', { name: field === 'discounts' ? 'ALL' : row.id });
    expect(link.getAttribute('href')).toContain('?chain=on');
    http.mockResolvedValueOnce(new Response('', { status: 500 }));
    fireEvent.click(screen.getAllByRole('button', { name: '다시 조회' })[0]);
    await screen.findByText('갱신 실패: 마지막 조회 데이터');
    expect(screen.getByRole('link', { name: field === 'discounts' ? 'ALL' : row.id })).toBeTruthy();
  });
  it('chain transition clears old rows and drops late HTTP', async () => {
    let resolve!: (response: Response) => void;
    http.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(route(Page));
    await act(async () => { window.history.replaceState(null, '', '/?chain=off'); window.dispatchEvent(new Event('explorer:chain-changed')); });
    await screen.findAllByText('미지원');
    await act(async () => resolve(Response.json({ [field]: [value] })));
    expect(screen.queryByRole('link', { name: field === 'discounts' ? 'ALL' : row.id })).toBeNull();
    expect(http.mock.calls.every(([url]) => String(url).startsWith('https://on.example/'))).toBe(true);
  });
});
it('BEX fee is raw, no percentage inference; unknown units visible', async () => {
  render(route(BexDetail));
  await screen.findByText(row.fee); expect(screen.queryByText('0.6%')).toBeNull();
  expect(screen.getByText(row.limit)).toBeTruthy(); expect(screen.getByText(/적용 의미는 미확인/)).toBeTruthy();
});
it('FeePolicy percent/percentage and huge/fractional raw amounts remain distinct', async () => {
  render(route(FeeDetail));
  await screen.findByText('100.000000000000000000');
  expect(screen.getByText('0.000000000000000001')).toBeTruthy();
  expect(screen.getByText('percent')).toBeTruthy(); expect(screen.getByText('percentage')).toBeTruthy();
  expect(screen.getByText(/전체 계정 적용을 확정하지 않습니다/)).toBeTruthy();
});
it('Oracle nonce zero and huge time stay raw; report presence does not imply verification', async () => {
  render(route(OracleDetail));
  await screen.findByText(/999999999999999999999 \(원문/);
  expect(screen.getByText(/최신 의미 미확인/)).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: /Reports/ }));
  await screen.findByText('unverified-signature');
  expect(screen.getByText(/서명·집계 검증을 수행하지 않았습니다/)).toBeTruthy();
  expect(screen.queryByText('검증됨')).toBeNull();
});
