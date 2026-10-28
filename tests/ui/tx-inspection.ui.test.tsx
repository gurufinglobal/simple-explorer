// @vitest-environment jsdom
import React from 'react';
import { PathParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '../helpers/render';
import TxDetailPage from '@/app/(explorer)/tx/[hash]/page';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
import fixture from '../fixtures/tx-inspection.synthetic.json';
afterEach(() => { cleanup(); vi.restoreAllMocks(); restoreHttpBoundary(); });
function page(locale: 'ko' | 'en' = 'ko') {
  return render(<PathParamsContext.Provider value={{ hash: '0x' + 'a'.repeat(64) }}><TxDetailPage /></PathParamsContext.Provider>, { locale });
}
async function open(label: string | RegExp) {
  const summary = screen.getByText(label, { selector: 'summary' });
  fireEvent.click(summary);
  await waitFor(() => expect(summary.parentElement?.hasAttribute('open')).toBe(true));
  // Native toggle dispatch is asynchronous in jsdom.
  fireEvent(summary.parentElement!, new Event('toggle'));
  return within(summary.parentElement!);
}
describe('real transaction detail page and service', () => {
  it('lazily shows messages, authentication, two event sources, bounded pages, Raw and exact copy in Korean', async () => {
    const http = mockQueryHttp(() => fixture);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    page(); await screen.findByText('Detailed fixture');
    expect(screen.queryByText('public-key-fixture')).toBeNull();
    expect(screen.queryByText('#1 transfer')).toBeNull();
    expect(screen.getByRole('link', { name: '42' }).getAttribute('href')).toBe('/blocks/42?chain=fixture');
    await open('메시지 본문 및 추가 정보');
    await open('#1 /cosmos.bank.v1beta1.MsgSend');
    expect(screen.getByText(/900719925474099312345678901/, { selector: 'pre' })).toBeTruthy();
    await open('#2 /custom.module.v9.MsgUnknown');
    expect(screen.getByText(/retained/, { selector: 'pre' })).toBeTruthy();
    await open('서명 정보 및 수수료 상세');
    expect(screen.getByText(/SIGN_MODE_DIRECT/, { selector: 'pre' })).toBeTruthy();
    await open('signatures'); expect(screen.getByText(/fixture-public-signature/, { selector: 'pre' })).toBeTruthy();
    const events = await open('이벤트 분석 및 Raw');
    expect(await screen.findByText('이 출처의 이벤트: 45개')).toBeTruthy();
    expect(screen.getByText(/c2VuZGVy: dGVzdA==/)).toBeTruthy();
    expect(screen.getByText(/plain: test/)).toBeTruthy();
    expect(screen.getByText(/invalid: %%%/)).toBeTruthy();
    expect(screen.getByText(/second-recipient/)).toBeTruthy();
    expect(screen.queryByText('#21 custom-18')).toBeNull();
    fireEvent.click(events.getByRole('button', { name: '다음' }));
    expect(await screen.findByText('#21 custom-18')).toBeTruthy();
    expect(screen.queryByText('#1 transfer')).toBeNull();
    fireEvent.click(events.getByRole('button', { name: 'Raw JSON' }));
    fireEvent.click(events.getByRole('button', { name: 'tx_response.events JSON 복사' }));
    await screen.findByText('복사했습니다.');
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(fixture.tx_response.events);
    await open('메시지별 로그 (tx_response.logs)'); await open('로그 #1 · 메시지 인덱스 0');
    expect(await screen.findByText('이 출처의 이벤트: 1개')).toBeTruthy();
    const raw = await open('전체 LCD 응답 Raw');
    fireEvent.click(raw.getByRole('button', { name: '전체 LCD 응답 Raw JSON 복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(JSON.parse(writeText.mock.calls[1][0])).toEqual(fixture);
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('renders English failed execution and unparseable log; copy failure has feedback', async () => {
    mockQueryHttp(() => ({ tx_response: { ...fixture.tx_response, code: 7, raw_log: 'execution failed: not JSON', events: [] }, tx: fixture.tx }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    page('en'); await screen.findByText('Detailed fixture');
    expect(screen.getByText('Failed', { exact: true })).toBeTruthy();
    await open('Event analysis and Raw'); expect(screen.getByText('Empty list (0)')).toBeTruthy();
    await open('Execution log (raw_log)'); expect(screen.getByText(/cannot be parsed as JSON/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy raw_log JSON' }));
    expect(await screen.findByText(/Could not copy/)).toBeTruthy();
  });
  it('shows unknown status and absent events distinctly from zero events', async () => {
    mockQueryHttp(() => ({ tx_response: { height: '42', txhash: 'A'.repeat(64), code: -1 } }));
    page(); await screen.findByText('실행 결과 미확인');
    const events = await open('이벤트 분석 및 Raw');
    expect(events.getByText('제공되지 않음')).toBeTruthy(); expect(events.queryByText('빈 목록 (0개)')).toBeNull();
  });
  it('bounds 1205 events and 25 repeated attributes while preserving the complete Raw payload', async () => {
    const attributes = Array.from({ length: 25 }, (_, i) => ({ key: 'same', value: `attribute-${i}` }));
    const events = Array.from({ length: 1205 }, (_, i) => ({ type: `bulk-${i}`, attributes: i === 0 ? attributes : [] }));
    const http = mockQueryHttp(() => ({ ...fixture, tx_response: { ...fixture.tx_response, events } }));
    page(); await screen.findByText('Detailed fixture');
    const panel = await open('이벤트 분석 및 Raw');
    expect(panel.getByText('이 출처의 이벤트: 1205개')).toBeTruthy();
    expect(panel.getByText('#20 bulk-19')).toBeTruthy();
    expect(panel.queryByText('#21 bulk-20')).toBeNull();
    expect(panel.getByText(/attribute-19$/)).toBeTruthy();
    expect(panel.queryByText(/attribute-24$/)).toBeNull();
    fireEvent.click(panel.getAllByRole('button', { name: '다음' })[1]);
    expect(await screen.findByText(/attribute-24$/)).toBeTruthy();
    fireEvent.click(panel.getByRole('button', { name: 'Raw JSON' }));
    expect(panel.getByText(/bulk-1204/, { selector: 'pre' })).toBeTruthy();
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('keeps the detail after refresh HTTP failure and marks stale', async () => {
    const http = mockQueryHttp(() => fixture); page(); await screen.findByText('Detailed fixture');
    http.mockResolvedValue(new Response('', { status: 500 }));
    fireEvent.click(screen.getByRole('button', { name: '다시 조회' }));
    expect(await screen.findByText('갱신 실패: 마지막 조회 데이터')).toBeTruthy();
    expect(screen.getByText('Detailed fixture')).toBeTruthy();
  });
});
