import { beforeEach, expect, it, vi } from 'vitest';
const { set, cookies } = vi.hoisted(() => { const set = vi.fn(); return { set, cookies: vi.fn(async () => ({ set })) }; });
vi.mock('next/headers', () => ({ cookies }));
import { setLocale } from '@/i18n/actions';
import { localeCookie } from '@/i18n/locale';
beforeEach(() => vi.clearAllMocks());
it('persists only the independent locale cookie with bounded options', async () => {
  await setLocale('ko');
  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith(localeCookie, 'ko', expect.objectContaining({ path: '/', sameSite: 'lax', httpOnly: true, maxAge: 31536000 }));
});
it('rejects unsupported values before accessing cookies', async () => {
  await expect(setLocale('../en')).rejects.toThrow('Unsupported locale');
  expect(cookies).not.toHaveBeenCalled();
});
