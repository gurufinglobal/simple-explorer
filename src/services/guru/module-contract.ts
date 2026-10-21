import { PartialQueryError, QueryError, schemaError } from '@/lib/query-result';

export const UNKNOWN_FIELD = '미확인';
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function rawText(value: unknown): string {
  if (value === undefined || value === null) return UNKNOWN_FIELD;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return schemaError('필드 원문을 안전하게 표시할 수 없습니다.');
}
export function requiredText(value: unknown): string {
  const text = rawText(value);
  if (text === UNKNOWN_FIELD || !text.trim()) schemaError('필수 식별자/필드가 없습니다.');
  return text;
}
/** Retain valid rows, never disguise a malformed response as a successful empty list. */
export function moduleRows<T, R>(value: T[] | undefined, map: (row: T) => R): R[] {
  if (!Array.isArray(value)) schemaError('모듈 목록 응답이 올바르지 않습니다.');
  const rows: R[] = [];
  let invalid = 0;
  for (const row of value) {
    try { if (!record(row)) schemaError(); rows.push(map(row)); } catch { invalid++; }
  }
  if (invalid) {
    const message = `모듈 응답 ${invalid}개 항목의 형식이 올바르지 않습니다. 현재 결과는 일부입니다.`;
    if (!rows.length) schemaError(message);
    throw new PartialQueryError(rows, { kind: 'schema', message });
  }
  return rows;
}

/** A list's partial payload must be selected before reaching a detail view. */
export async function moduleDetail<T>(load: () => Promise<T[]>, select: (row: T) => boolean): Promise<T | null> {
  try { return (await load()).find(select) ?? null; }
  catch (error) {
    if (!(error instanceof PartialQueryError)) throw error;
    const match = (error.data as T[]).find(select);
    if (!match) throw new QueryError(error.info);
    throw new PartialQueryError(match, error.info);
  }
}
