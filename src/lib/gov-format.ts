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
export function formatGovDurationLabel(raw: string): string {
  const s = raw.trim();
  const secMatch = /^(\d+)s$/.exec(s);
  if (secMatch) {
    const sec = Number(secMatch[1]);
    if (!Number.isNaN(sec)) {
      if (sec >= 86400) {
        return `${(sec / 86400).toFixed(1)}일 (${raw})`;
      }
      if (sec >= 3600) {
        return `${(sec / 3600).toFixed(1)}시간 (${raw})`;
      }
      if (sec >= 60) {
        return `${(sec / 60).toFixed(0)}분 (${raw})`;
      }
      return `${sec}초 (${raw})`;
    }
  }
  return raw;
}
