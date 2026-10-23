// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor } from '../helpers/render';
import { LandingHeader } from '@/components/layout/landing-header';
import { LocaleSelector } from '@/components/layout/locale-selector';

const { setLocale, refresh } = vi.hoisted(() => ({ setLocale: vi.fn(), refresh: vi.fn() }));
vi.mock('@/i18n/actions', () => ({ setLocale }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each(['en', 'ko'] as const)('opens the %s menu with keyboard, marks selection and restores focus', async locale => {
  const user = userEvent.setup();
  render(<LandingHeader />, { locale });
  const trigger = screen.getByRole('button', { name: locale === 'en' ? 'Language' : '언어' });
  expect(screen.getByRole('navigation')).toBeTruthy();
  expect(screen.getAllByRole('link')).toHaveLength(4);
  trigger.focus(); await user.keyboard('{Enter}');
  const selected = screen.getByRole('menuitemradio', { name: locale === 'en' ? 'English' : '한국어' });
  expect(selected).toHaveAttribute('aria-checked', 'true');
  expect(selected).toHaveFocus();
  await user.keyboard('{ArrowDown}{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(setLocale).not.toHaveBeenCalled();
});

it('saves once while pending, refreshes only on success and avoids saving the current language', async () => {
  const user = userEvent.setup();
  let finish!: () => void;
  setLocale.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<LocaleSelector id="test-language" variant="menu" />, { locale: 'en' });
  const trigger = screen.getByRole('button', { name: 'Language' });
  await user.click(trigger); await user.click(screen.getByRole('menuitemradio', { name: 'English' }));
  expect(setLocale).not.toHaveBeenCalled();
  await user.click(trigger); await user.click(screen.getByRole('menuitemradio', { name: '한국어' }));
  expect(setLocale).toHaveBeenCalledTimes(1);
  expect(setLocale).toHaveBeenCalledWith('ko');
  expect(trigger).toHaveAttribute('aria-disabled', 'true');
  await user.click(trigger);
  expect(screen.queryByRole('menu')).toBeNull();
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(trigger).toHaveAttribute('aria-disabled', 'false');
});

it.each(['en', 'ko'] as const)('shows a translated %s save failure and allows retry', async locale => {
  const user = userEvent.setup();
  setLocale.mockRejectedValueOnce(new Error('boundary failure')).mockResolvedValueOnce(undefined);
  render(<LocaleSelector id="test-language" variant="menu" />, { locale });
  const trigger = screen.getByRole('button', { name: locale === 'en' ? 'Language' : '언어' });
  const other = locale === 'en' ? '한국어' : 'English';
  await user.click(trigger); await user.click(screen.getByRole('menuitemradio', { name: other }));
  expect(screen.getByRole('alert')).toHaveTextContent(locale === 'en' ? 'Could not change language. Please retry.' : '언어를 변경하지 못했습니다. 다시 시도하세요.');
  expect(refresh).not.toHaveBeenCalled();
  await user.click(trigger); await user.click(screen.getByRole('menuitemradio', { name: other }));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps the explorer selector as a labeled select by default', () => {
  render(<LocaleSelector id="test-language" />, { locale: 'en' });
  expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Language' })).toBeNull();
});
