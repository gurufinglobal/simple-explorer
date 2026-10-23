'use client';
import { useLocale } from 'next-intl';
import { formatTimestamp } from '@/lib/relative-time';

/** Keep the exact source timestamp available while displaying a locale-specific UTC date. */
export function LocalizedTime({ value }: { value: string }) {
  const locale = useLocale();
  return <time dateTime={value} title={value}>{formatTimestamp(value, locale)}</time>;
}
