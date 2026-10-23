import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { localeCookie, resolveLocale } from './locale';

export default getRequestConfig(async () => {
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(jar.get(localeCookie)?.value, requestHeaders.get('accept-language'));
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default, timeZone: 'UTC', now: new Date() };
});
