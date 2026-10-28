import { QueryError } from '@/lib/query-result';
import { serviceMessage } from '@/i18n/service-message';

const MAX_ACTIVE = 10;
const MAX_QUEUED = 100;
type Queue = { active: number; waiting: (() => void)[] };
const queues = new Map<string, Queue>();
const cancelled = () => new QueryError({ kind: 'cancelled', ...serviceMessage('query_cancelled') });

/** One JS runtime only. Queued requests share the caller's timeout and cancellation. */
export function acquireRequest(url: string, signal: AbortSignal): (() => void) | Promise<() => void> {
  if (signal.aborted) throw cancelled();
  const endpoint = new URL(url).origin;
  let queue = queues.get(endpoint);
  if (!queue) { queue = { active: 0, waiting: [] }; queues.set(endpoint, queue); }
  const state = queue;
  const release = () => {
    state.active--;
    state.waiting.shift()?.();
    if (!state.active && !state.waiting.length) queues.delete(endpoint);
  };
  if (state.active < MAX_ACTIVE) { state.active++; return release; }
  if (state.waiting.length >= MAX_QUEUED) throw new QueryError({ kind: 'incomplete', ...serviceMessage('request_queue_full') });
  return new Promise<() => void>((resolve, reject) => {
    const abort = () => {
      const index = state.waiting.indexOf(start);
      if (index >= 0) state.waiting.splice(index, 1);
      reject(cancelled());
    };
    const start = () => { signal.removeEventListener('abort', abort); state.active++; resolve(release); };
    state.waiting.push(start);
    signal.addEventListener('abort', abort, { once: true });
  });
}

type Entry = { controller: AbortController; promise: Promise<unknown>; users: number; settled: boolean; expires: number };
const reads = new Map<string, Entry>();
const MAX_READS = 256;
export function invalidateSharedReads(identity?: string) {
  for (const key of reads.keys()) if (!identity || key.startsWith(identity + '|')) reads.delete(key);
}
/** Failures are never cached. Cancelling one subscriber cannot cancel the others. */
export function sharedRead<T>(key: string, ttl: number, signal: AbortSignal | undefined, load: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (signal?.aborted) return Promise.reject(cancelled());
  let entry = reads.get(key);
  if (entry?.settled && entry.expires <= Date.now()) { reads.delete(key); entry = undefined; }
  if (!entry) {
    const controller = new AbortController();
    const created: Entry = { controller, users: 0, settled: false, expires: 0, promise: Promise.resolve() };
    created.promise = load(controller.signal).then(value => {
      created.settled = true; created.expires = Date.now() + ttl;
      if (!ttl && reads.get(key) === created) reads.delete(key);
      return value;
    }, error => { created.settled = true; if (reads.get(key) === created) reads.delete(key); throw error; });
    // Bound retained entries, including the number of shared in-flight keys.
    if (reads.size >= MAX_READS) reads.delete(reads.keys().next().value!);
    reads.set(key, created); entry = created;
  }
  const current = entry;
  current.users++;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = (callback: () => void) => {
      if (finished) return;
      finished = true; signal?.removeEventListener('abort', abort); current.users--;
      if (!current.users && !current.settled) {
        if (reads.get(key) === current) reads.delete(key);
        current.controller.abort();
      }
      callback();
    };
    const abort = () => {
      if (current.users === 1 && !current.settled) {
        if (reads.get(key) === current) reads.delete(key);
        current.controller.abort();
      } else finish(() => reject(cancelled()));
    };
    signal?.addEventListener('abort', abort, { once: true });
    current.promise.then(value => finish(() => signal?.aborted ? reject(cancelled()) : resolve(value as T)), error => finish(() => reject(error)));
  });
}
