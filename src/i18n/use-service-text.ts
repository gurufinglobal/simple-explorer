'use client';
import { useTranslations } from 'next-intl';
import { describeServiceMessage } from './service-message';

/** Only use for app-owned status/error fields. Addresses, memos and proposal bodies stay raw. */
export function useServiceText() {
  const t = useTranslations('common.service');
  const translate = (value: unknown, depth = 0): string => {
    const raw = typeof value === 'string' ? value : value instanceof Error ? value.message : value && typeof value === 'object' && 'message' in value ? String(value.message) : '';
    if (depth > 3) return raw;
    const descriptor = describeServiceMessage(value);
    if (!descriptor) {
      // These separators compose app warnings (e.g. fee + storage warnings).
      const labelled = /^(.+?): ([\s\S]+)$/.exec(raw);
      if (labelled && describeServiceMessage(labelled[1])) return `${translate(labelled[1], depth + 1)}: ${translate(labelled[2], depth + 1)}`;
      const parts = raw.split(' · ');
      return parts.length > 1 && parts.some(part => describeServiceMessage(part))
        ? parts.map(part => translate(part, depth + 1)).join(' · ') : raw;
    }
    const params = Object.fromEntries(Object.entries(descriptor.messageParams ?? {}).map(([key, part]) => [key, typeof part === 'string' ? translate(part, depth + 1) : part]));
    return t(descriptor.messageCode, params);
  };
  return translate;
}
