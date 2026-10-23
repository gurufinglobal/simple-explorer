
import { serviceText } from '@/i18n/service-message';
import { PartialQueryError, type QueryErrorInfo } from './query-result';

export type LcdPagination = { next_key?: string | null; total?: string };
export type QueryPage<T> = {
  rows: T[];
  nextCursor: string | null;
  // LCD totals are endpoint-dependent (and often zero when count_total=false).
  // Retain the raw value for diagnostics; never infer a verified population.
  total: string | null;
  totalVerified: false;
  stopReason?: string;
  warning?: QueryErrorInfo;
};
export function cursorParam(cursor?: string | null): string {
  return cursor ? `&pagination.key=${encodeURIComponent(cursor)}` : '';
}
export function queryPage<T>(rows: T[], pagination?: LcdPagination, limit = 100): QueryPage<T> {
  return {
    rows, nextCursor: pagination?.next_key || null,
    total: pagination?.total ?? null, totalVerified: false,
    ...(pagination?.next_key === undefined && rows.length >= limit ? { stopReason: serviceText("stopped_at_the_query_limit_because_the_server_did_not") } : {}),
  };
}
/** Compatibility for non-paginated consumers, including receipt refresh jobs. */
export async function pageRows<T>(load: Promise<QueryPage<T>>): Promise<T[]> {
  try { return (await load).rows; }
  catch (error) {
    if (error instanceof PartialQueryError) throw new PartialQueryError((error.data as QueryPage<T>).rows, error.info);
    throw error;
  }
}
