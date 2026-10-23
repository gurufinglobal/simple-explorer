export const locales = ['en', 'ko'] as const;
export type Locale = (typeof locales)[number];
export const localeCookie = 'explorer-locale';
export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ko';
}
/** A supported cookie wins; otherwise negotiate supported language ranges by weight. */
export function resolveLocale(cookie?: string, acceptLanguage?: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const candidates = (acceptLanguage ?? '').split(',').map((entry, index) => {
    const [range, ...parameters] = entry.trim().toLowerCase().split(';');
    const q = parameters.find(p => p.trim().startsWith('q='));
    const weight = q ? Number(q.trim().slice(2)) : 1;
    return { locale: range.split('-')[0], weight, index };
  }).filter(c => Number.isFinite(c.weight) && c.weight > 0 && c.weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return candidates.find(c => isLocale(c.locale))?.locale as Locale | undefined ?? 'en';
}
