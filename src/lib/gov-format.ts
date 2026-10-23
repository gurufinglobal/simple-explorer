/**
 * Format Cosmos gov module decimal ratio strings (e.g. "0.334000000000000000") as percent labels.
 */
export function formatGovRatioPercent(raw: string): string {
  const n = Number(raw);
  if (Number.isNaN(n)) {
    return raw;
  }
  return `${(n * 100).toFixed(2)}%`;
}

/**
 * Best-effort label for x/gov voting_period / max_deposit_period (e.g. "120h", "432000s").
 */
export function formatGovDurationLabel(raw: string, locale = "ko"): string {
  const match = /^(\d+)s$/.exec(raw.trim());
  if (!match) return raw;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) return raw;
  const [unit, divisor, digits]: [string, number, number] = seconds >= 86400 ? ['day', 86400, 1]
    : seconds >= 3600 ? ['hour', 3600, 1] : seconds >= 60 ? ['minute', 60, 0] : ['second', 1, 0];
  return `${new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(seconds / divisor)} (${raw})`;
}
