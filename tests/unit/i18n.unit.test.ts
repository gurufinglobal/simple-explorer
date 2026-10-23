import { describe, expect, it } from 'vitest';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { createTranslator } from 'next-intl';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { queryError } from '@/lib/query-result';
import { resolveLocale } from '@/i18n/locale';
import { describeServiceMessage, ServiceError, serviceMessage } from '@/i18n/service-message';
import { formatRelativeFutureOrPast, formatTimestamp } from '@/lib/relative-time';

function flatten(value: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => typeof child === 'string'
    ? [[prefix + key, child]] : Object.entries(flatten(child, `${prefix}${key}.`))));
}
function signature(elements: MessageFormatElement[]): string[] {
  return elements.flatMap(element => {
    if (element.type === TYPE.literal || element.type === TYPE.pound) return [];
    const values = [`${element.value}:${element.type}`];
    if ('options' in element) for (const option of Object.values(element.options)) values.push(...signature(option.value));
    if ('children' in element) values.push(...signature(element.children));
    return values;
  }).sort();
}

describe('locale negotiation', () => {
  it.each([
    ['ko', 'en-US,en;q=0.9', 'ko'], ['en', 'ko-KR', 'en'],
    ['bad', 'fr;q=1,ko-KR;q=0.8,en;q=0.5', 'ko'],
    [undefined, 'ko;q=0,en-US;q=0.1', 'en'],
    [undefined, 'en;q=0.2,ko;q=0.8', 'ko'],
    [undefined, 'ko;q=oops,en;q=0.5', 'en'],
    [undefined, 'ko;q=2', 'en'], [undefined, 'ja,*;q=0.5', 'en'],
    [undefined, null, 'en'], ['KO', 'ko-KR', 'ko'],
  ])('cookie %s / header %s resolves to %s', (cookie, header, locale) => {
    expect(resolveLocale(cookie, header)).toBe(locale);
  });
});

it('every ko/en key has matching ICU placeholder types and formats without missing values', () => {
  const english = flatten(en), korean = flatten(ko);
  expect(Object.keys(english).sort()).toEqual(Object.keys(korean).sort());
  for (const locale of ['en', 'ko'] as const) {
    const messages = locale === 'en' ? en : ko;
    for (const [key, message] of Object.entries(flatten(messages))) {
      expect(signature(parse(message)), key).toEqual(signature(parse(english[key])));
      const params = Object.fromEntries(signature(parse(message)).map(value => [value.split(':')[0], 'RAW-900719925474099312345']));
      // Catalog completeness test uses the real formatter; app typing is checked separately.
      const t = createTranslator({ locale, messages: { message }, onError: error => { throw error; } });
      const output = t("message", params);
      expect(output, key).not.toContain('MISSING_MESSAGE');
      for (const name of Object.keys(params)) expect(output, `${key}:${name}`).toContain(params[name]);
    }
  }
});

it('errors retain stable code/parameters and original detail, including legacy saved results', () => {
  const error = new ServiceError('exceeds_the_allowed_decimal_places', { value0: 6 });
  expect(error.message).toBe('허용 소수 6자리를 초과했습니다.');
  expect(describeServiceMessage(error)).toEqual(serviceMessage('exceeds_the_allowed_decimal_places', { value0: 6 }));
  expect(describeServiceMessage(error.message)?.messageCode).toBe(error.messageCode);
  expect(describeServiceMessage('remote RPC detail: insufficient funds')).toBeNull();
  expect(describeServiceMessage(`prefix ${error.message} suffix`)).toBeNull();
});

it('formats relative dates with the supplied clock and locale, and absolute dates in UTC', () => {
  const now = Date.parse('2026-10-23T00:00:00Z');
  expect(formatRelativeFutureOrPast('2026-10-22T23:59:00Z', now, 'en')).toBe('1 minute ago');
  expect(formatRelativeFutureOrPast('2026-10-23T00:02:00Z', now, 'ko')).toBe('2분 후');
  expect(formatTimestamp('2026-10-23T09:00:00+09:00', 'en')).toBe(formatTimestamp('2026-10-23T00:00:00Z', 'en'));
  expect(formatTimestamp('bad', 'ko')).toBe('—');
});

it("retains unknown transport detail and ignores stale receipt translation metadata", () => {
  expect(queryError(new Error("rpc raw detail"))).toMatchObject({ kind: "network", detail: "rpc raw detail", messageCode: "network_query_failed" });
  const stale = { ...serviceMessage("checking_broadcast_and_inclusion_no_automatic_resubmission"), message: "raw execution failure" };
  expect(describeServiceMessage(stale)).toBeNull();
});
