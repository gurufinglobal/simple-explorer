// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '../helpers/render';
import { NextIntlClientProvider, useLocale } from 'next-intl';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { CoinAmount } from '@/components/amount/coin-amount';
import { ServiceErrorText } from '@/components/query/service-error-text';
import { TransactionConfirmDialog } from '@/components/transactions/transaction-confirm-dialog';
import type { TransactionSnapshot } from '@/services/transactions/transaction';
import { serviceMessage } from '@/i18n/service-message';
import { useNowTick } from '@/hooks/use-now-tick';
import { formatRelativeFutureOrPast } from '@/lib/relative-time';

afterEach(cleanup);
it.each(['en', 'ko'] as const)('preserves exact amounts, addresses and proposal body in %s confirmation', locale => {
  const snapshot: TransactionSnapshot = {
    action: '텍스트 제안', chainKey: 'chain-a', chainId: 'raw-chain-1', sender: 'guru1rawsender', recipient: 'gov1authority',
    displayAmount: '9007199254740993.123456789', amount: '9007199254740993123456789', denom: 'agxn', unit: 'GXN',
    governance: { title: '온체인 원문 Original title', summary: 'Original summary 요약', description: 'Original description 본문' },
    fee: { gas: '200000', amount: [{ amount: '123', denom: 'agxn' }] }, feeBasis: '원문 근거', preparedAt: 0,
  };
  const confirm = vi.fn();
  render(<TransactionConfirmDialog snapshot={snapshot} onCancel={() => {}} onConfirm={confirm} />, { locale });
  const dialog = screen.getByRole('dialog', { name: locale === 'en' ? 'Review before submitting transaction' : '거래 실행 전 확인' });
  for (const value of [snapshot.sender, snapshot.recipient, snapshot.amount!, snapshot.displayAmount!, ...Object.values(snapshot.governance!)]) expect(dialog.textContent).toContain(value);
  expect(screen.getByRole('button', { name: locale === 'en' ? 'Confirm and request wallet signature' : '확인하고 지갑 서명' })).toBeTruthy();
  expect(confirm).not.toHaveBeenCalled();
});
it.each(['en', 'ko'] as const)('translates known errors and preserves unknown RPC detail in %s', locale => {
  render(<><p><ServiceErrorText error={serviceMessage('exceeds_the_allowed_decimal_places', { value0: 6 })} /></p><p><ServiceErrorText error={new Error('rpc: unknown failure 원문')} /></p></>, { locale });
  expect(screen.getByText(locale === 'en' ? 'Exceeds the allowed 6 decimal places.' : '허용 소수 6자리를 초과했습니다.')).toBeTruthy();
  expect(screen.getByText(/rpc: unknown failure 원문/).getAttribute('data-original-error')).toBe('true');
});
it('does not parse localized display strings back into coin values', () => {
  const amount = '9007199254740993123456789';
  render(<CoinAmount coin={{ amount, denom: 'rawDenom' }} />, { locale: 'en' });
  expect(screen.getByText(`${amount} rawDenom (precision unknown)`)).toBeTruthy();
});
it.each(['en', 'ko'] as const)('hydrates the request clock without changing initial %s text', async locale => {
  const now = new Date('2026-10-23T00:00:00Z');
  function Time() { const locale = useLocale(); return <span>{formatRelativeFutureOrPast('2026-10-22T23:59:00Z', useNowTick(), locale)}</span>; }
  const view = <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ko} now={now} timeZone="UTC"><Time /></NextIntlClientProvider>;
  const container = document.createElement('div');
  container.innerHTML = renderToString(view); document.body.append(container);
  const before = container.textContent, onRecoverableError = vi.fn();
  let root: ReturnType<typeof hydrateRoot>;
  await act(async () => { root = hydrateRoot(container, view, { onRecoverableError }); });
  expect(container.textContent).toBe(before); expect(onRecoverableError).not.toHaveBeenCalled();
  await act(async () => root.unmount()); container.remove();
});
