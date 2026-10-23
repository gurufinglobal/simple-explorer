import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ko from '../../messages/ko.json';
import en from '../../messages/en.json';
export * from '@testing-library/react';

export function render(ui: ReactElement, options: RenderOptions & { locale?: 'en' | 'ko' } = {}) {
  const { locale = 'ko', wrapper: Wrapper, ...rest } = options;
  const now = new Date();
  function Provider({ children }: { children: ReactNode }) {
    return <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? ko : en} timeZone="UTC" now={now} onError={error => { throw error; }}>
      {Wrapper ? <Wrapper>{children}</Wrapper> : children}
    </NextIntlClientProvider>;
  }
  return rtlRender(ui, { ...rest, wrapper: Provider });
}

export function TestIntlProvider({ children, locale = "ko" }: { children: ReactNode; locale?: "en" | "ko" }) {
  return <NextIntlClientProvider locale={locale} messages={locale === "ko" ? ko : en} timeZone="UTC" now={new Date()}>{children}</NextIntlClientProvider>;
}
