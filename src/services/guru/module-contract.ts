
import { serviceText } from '@/i18n/service-message';
import { PartialQueryError, QueryError, schemaError } from '@/lib/query-result';

/** A locale-neutral missing-value marker; actual response strings remain untouched. */
export const UNKNOWN_FIELD = "—";
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function rawText(value: unknown): string {
  if (value === undefined || value === null) return UNKNOWN_FIELD;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return schemaError(serviceText("cannot_safely_display_the_raw_field"));
}
export function requiredText(value: unknown): string {
  const text = rawText(value);
  if (text === UNKNOWN_FIELD || !text.trim()) schemaError(serviceText("required_identifier_or_field_missing"));
  return text;
}
/** Retain valid rows, never disguise a malformed response as a successful empty list. */
export function moduleRows<T, R>(value: T[] | undefined, map: (row: T) => R): R[] {
  if (!Array.isArray(value)) schemaError(serviceText("invalid_module_list_response"));
  const rows: R[] = [];
  let invalid = 0;
  for (const row of value) {
    try { if (!record(row)) schemaError(); rows.push(map(row)); } catch { invalid++; }
  }
  if (invalid) {
    const message = serviceText("invalid_format_in_module_response_entries_results_are_partial", { value0: String(invalid) });
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
