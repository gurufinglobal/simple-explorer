/**
 * Human-readable elapsed time since `iso` (Korean), relative to `nowMs`.
 */
export function formatRelativePastFromIso(iso: string, nowMs: number): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return "—";
  }
  const diffMs = Math.max(0, nowMs - parsed);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) {
    return `${sec}초 전`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}분 전`;
  }
  const h = Math.floor(min / 60);
  if (h < 24) {
    return `${h}시간 전`;
  }
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

/** Past → "N분 전", future → "N분 후" (Korean). */
export function formatRelativeFutureOrPast(iso: string, nowMs: number): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return "—";
  }
  const diffMs = parsed - nowMs;
  if (diffMs <= 0) {
    return formatRelativePastFromIso(iso, nowMs);
  }
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) {
    return `${sec}초 후`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}분 후`;
  }
  const h = Math.floor(min / 60);
  if (h < 24) {
    return `${h}시간 후`;
  }
  const d = Math.floor(h / 24);
  return `${d}일 후`;
}
