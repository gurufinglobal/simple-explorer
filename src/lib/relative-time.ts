function relative(iso: string, nowMs: number, locale: string, pastOnly: boolean): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '—';
  const delta = pastOnly ? Math.min(0, parsed - nowMs) : parsed - nowMs;
  const seconds = Math.floor(Math.abs(delta) / 1000);
  const [size, unit]: [number, Intl.RelativeTimeFormatUnit] = seconds < 60 ? [1, 'second']
    : seconds < 3600 ? [60, 'minute'] : seconds < 86400 ? [3600, 'hour'] : [86400, 'day'];
  return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format((delta <= 0 ? -1 : 1) * Math.floor(seconds / size), unit);
}
/** The caller supplies the request locale and shared clock for deterministic SSR. */
export function formatRelativePastFromIso(iso: string, nowMs: number, locale = 'ko'): string {
  return relative(iso, nowMs, locale, true);
}
export function formatRelativeFutureOrPast(iso: string, nowMs: number, locale = 'ko'): string {
  return relative(iso, nowMs, locale, false);
}
export function formatTimestamp(iso: string, locale: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '—';
  return `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(date)} (UTC)`;
}
