/** Serializable read contract shared by services and client views. */
export type QueryContext = { chain: string; target: string };
export type QueryStatus = 'idle' | 'loading' | 'success' | 'empty' | 'not-found' | 'partial' | 'stale' | 'error' | 'unsupported' | 'cancelled';
export type QueryErrorInfo = {
  kind: 'http' | 'timeout' | 'network' | 'parse' | 'schema' | 'unsupported' | 'cancelled' | 'not-found' | 'incomplete';
  message: string;
  status?: number;
  retryAt?: number;
  causes?: QueryErrorInfo[];
};
export type QueryResult<T> = {
  data: T | null;
  status: QueryStatus;
  error: QueryErrorInfo | null;
  context: QueryContext;
  observedAt: string | null;
  blockHeight?: string;
};
export class QueryError extends Error {
  constructor(public readonly info: QueryErrorInfo) { super(info.message); this.name = 'QueryError'; }
}
/** A service may preserve successful fields/pages while reporting failed siblings. */
export class PartialQueryError<T> extends QueryError {
  constructor(public readonly data: T, info: QueryErrorInfo) { super(info); }
}
export function queryError(error: unknown): QueryErrorInfo {
  if (error instanceof QueryError) return error.info;
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
  if (name === 'AbortError') return { kind: 'cancelled', message: '조회가 취소되었습니다.' };
  if (name === 'TimeoutError') return { kind: 'timeout', message: '조회 제한 시간(10초)을 초과했습니다.' };
  if (name === 'SyntaxError') return { kind: 'parse', message: 'JSON 응답을 읽을 수 없습니다.' };
  return { kind: 'network', message: '네트워크 조회에 실패했습니다.' };
}
export function schemaError(message = '응답 형식이 올바르지 않습니다.'): never {
  throw new QueryError({ kind: 'schema', message });
}
export function initialResult<T>(context: QueryContext): QueryResult<T> {
  return { data: null, status: 'idle', error: null, context, observedAt: null };
}
function observedHeight(data: unknown): string | undefined {
  if (Array.isArray(data)) return observedHeight(data[0]);
  if (!data || typeof data !== 'object') return undefined;
  const value = 'blockHeight' in data ? data.blockHeight : 'height' in data ? data.height : undefined;
  return value !== null && value !== undefined ? String(value) : undefined;
}
export async function readQuery<T>(context: QueryContext, load: () => Promise<T>, previous?: QueryResult<T>): Promise<QueryResult<T>> {
  const prior = previous?.context.chain === context.chain && previous.context.target === context.target ? previous : undefined;
  try {
    const data = await load();
    const height = observedHeight(data);
    return { data, context, status: data === null ? 'not-found' : Array.isArray(data) && data.length === 0 ? 'empty' : 'success', error: null, observedAt: new Date().toISOString(), ...(height ? { blockHeight: height } : {}) };
  } catch (error) {
    const info = queryError(error);
    if (error instanceof PartialQueryError && !prior?.observedAt && info.kind !== "cancelled") return { data: error.data, context, status: 'partial', error: info, observedAt: new Date().toISOString(), blockHeight: observedHeight(error.data) };
    return {
      data: prior?.data ?? null, context, observedAt: prior?.observedAt ?? (info.kind === "not-found" ? new Date().toISOString() : null), blockHeight: prior?.blockHeight,
      status: info.kind === 'cancelled' ? 'cancelled' : prior?.observedAt ? 'stale' : info.kind === 'unsupported' ? 'unsupported' : info.kind === 'not-found' ? 'not-found' : 'error', error: info
    };
  }
}

/** Preserve fulfilled siblings instead of turning any failed request into an empty list. */
export async function collectQuery<T>(requests: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(requests);
  const values = results.flatMap(item => item.status === 'fulfilled' ? [item.value] : []);
  const failed = results.find(item => item.status === 'rejected');
  if (failed?.status === 'rejected') {
    if (values.length) throw new PartialQueryError(values, combinedError(results.flatMap(item => item.status === "rejected" ? [item.reason] : [])));
    throw failed.reason;
  }
  return values;
}

export function combinedError(errors: unknown[]): QueryErrorInfo {
  const causes = errors.map(queryError);
  const retryAt = Math.max(0, ...causes.map(error => error.retryAt ?? 0));
  return { ...causes[0], causes, ...(retryAt ? { retryAt } : {}) };
}

/** Each field has its own request; unavailable fields keep explicit placeholders. */
export async function readFields<T extends Record<string, unknown>>(defaults: T, requests: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
  const keys = Object.keys(requests) as (keyof T)[];
  const settled = await Promise.allSettled(keys.map(key => requests[key]));
  const data = { ...defaults };
  settled.forEach((result, index) => { if (result.status === 'fulfilled') data[keys[index]] = result.value; });
  const errors = settled.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
  if (errors.length) {
    if (errors.length === keys.length) throw new QueryError(combinedError(errors));
    throw new PartialQueryError(data, combinedError(errors));
  }
  return data;
}
