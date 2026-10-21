// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PathParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import AddressDetailPage from '@/app/(explorer)/address/[address]/page';
import { ValidatorsTable } from '@/components/staking/validators-table';
import { getTopValidators } from '@/services/guru/staking.service';
import { mockQueryHttp, fixtureAddress } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
import { amountReviewResponse, delegatedCoins, reviewMetadata } from '../helpers/amount-review';
afterEach(() => { cleanup(); restoreHttpBoundary(); });
function addressPage() {
  render(<PathParamsContext.Provider value={{ address: fixtureAddress }}><AddressDetailPage /></PathParamsContext.Provider>);
}
it.each([false, true])('R1 address retry restores metadata-only full/page failure and clears warning: later page %s', async later => {
  let failed = true;
  mockQueryHttp(url => {
    if (!failed || !url.pathname.endsWith('/denoms_metadata')) return amountReviewResponse(url);
    if (later && !url.searchParams.has('pagination.key')) return { ...reviewMetadata, pagination: { next_key: 'next' } };
    return new Response('', { status: 503 });
  });
  addressPage();
  await userEvent.click(within(screen.getByRole("region", { name: "주소 조회 정보" })).getByRole("button", { name: "조회 정보" }));
  const query = (await screen.findByText(new RegExp("fixture · 대상: address-portfolio:" + fixtureAddress))).closest('[data-query-status]') as HTMLElement;
  expect(query.getAttribute('data-query-status')).toBe('partial');
  expect(within(query).getByRole('alert').textContent).toContain('Metadata 조회 실패');
  const staking = screen.getByRole('region', { name: '위임 원본 금액' });
  expect(within(staking).getByText(later ? '1 GXN' : '1000000000000000001 agxn (정밀도 미확인)')).toBeTruthy();
  failed = false;
  await userEvent.click(within(query).getByRole('button', { name: '위임과 보상 다시 조회' }));
  await waitFor(() => expect(query.getAttribute('data-query-status')).toBe('success'));
  expect(within(query).queryByRole('alert')).toBeNull();
  expect(within(staking).getByText('1 GXN')).toBeTruthy();
});
it('R2 public address exposes each 6/18-place delegation original, including the floored base unit', async () => {
  mockQueryHttp(amountReviewResponse);
  addressPage();
  const staking = screen.getByRole('region', { name: '위임 원본 금액' });
  expect(await within(staking).findByText('1 GXN')).toBeTruthy();
  expect(within(staking).getByText('1.234567 TEST')).toBeTruthy();
  const buttons = within(staking).getAllByRole('button', { name: '원본 금액' });
  for (const [i, button] of buttons.entries()) {
    const raw = within(staking).getByText(`${delegatedCoins[i].amount} ${delegatedCoins[i].denom}`);
    expect(raw.parentElement!.hidden).toBe(true);
    await userEvent.click(button);
    expect(raw.parentElement!.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  }
});
it('R3 validator original toggles by pointer/keyboard without navigation; detail is a chain-preserving native link', async () => {
  mockQueryHttp(amountReviewResponse);
  const validators = await getTopValidators();
  const push = vi.fn();
  render(<AppRouterContext.Provider value={{ push, back: vi.fn(), forward: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }}><ValidatorsTable validators={validators} /></AppRouterContext.Provider>);
  const button = screen.getByRole('button', { name: '원본 금액' });
  const raw = screen.getByText('1000000000000000001 agxn');
  expect(raw.parentElement!.hidden).toBe(true);
  await userEvent.click(button);
  expect(raw.parentElement!.hidden).toBe(false);
  await userEvent.click(button);
  expect(raw.parentElement!.hidden).toBe(true);
  button.focus();
  await userEvent.keyboard('{Enter}');
  expect(raw.parentElement!.hidden).toBe(false);
  await userEvent.keyboard(' ');
  expect(raw.parentElement!.hidden).toBe(true);
  expect(push).not.toHaveBeenCalled();
  const link = screen.getByRole('link', { name: 'Validator' });
  expect(link.getAttribute('href')).toBe('/staking/v?chain=fixture');
  // Actual native link navigation is exercised by mobile-accessibility.browser.mjs.
  link.focus(); expect(document.activeElement).toBe(link);
});
