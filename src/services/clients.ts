import { acquireRequest, sharedRead, invalidateSharedReads } from './request-control';
import { ServiceError } from "@/i18n/service-message";

import { serviceMessage, serviceText } from '@/i18n/service-message';
import { requireModule } from "@/lib/module-capability";
import type { QueryObservation } from "@/lib/query-result";
import { validateLcdJson } from "@/services/lcd-schema";
import { QueryError, queryError } from "@/lib/query-result";
import {
  type ChainConfig,
} from "@/lib/env";
import { getActiveChainConfig as getActiveChainConfigFromClientCookie } from "@/lib/chain-selection";

function toUrl(base: string, pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith("/")) {
    return `${base}${pathOrUrl}`;
  }
  return `${base}/${pathOrUrl}`;
}

export type ReadOptions = { signal?: AbortSignal; timeoutMs?: number; onResponse?: (response: Response) => void };

export async function requestJson<T>(url: string, init: RequestInit = {}, options: ReadOptions = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 10_000);
  let release: (() => void) | undefined;
  try {
    const permit = acquireRequest(url, controller.signal);
    release = typeof permit === "function" ? permit : await permit;
    if (Date.now() >= deadline) { timedOut = true; controller.abort(); }
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (!response.ok) {
      if (response.status === 404 && /\/cosmos\/auth\/v1beta1\/accounts\//.test(url)) {
        const body = await response.clone().json().catch(() => null) as { code?: number; message?: string } | null;
        if (body?.code === 5 && /account.*not found|unknown address/i.test(body.message ?? "")) {
          throw new QueryError({ kind: "not-found", status: 404, ...serviceMessage("account_has_not_been_created_yet_bank_balances_are_queried") });
        }
      }
      const retry = response.headers.get("Retry-After");
      const retryAt = retry ? (/^\d+(?:\.\d+)?$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry)) : NaN;
      throw new QueryError({ kind: "http", status: response.status, ...serviceMessage("http_query_failed", { value0: String(response.status) }), ...(Number.isFinite(retryAt) ? { retryAt } : {}) });
    }
    options.onResponse?.(response);
    try {
      const body = await response.json() as T;
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      return body;
    }
    catch (error) { if (controller.signal.aborted) throw error; throw new QueryError({ kind: "parse", ...serviceMessage("could_not_read_the_json_response") }); }
  } catch (error) {
    if (controller.signal.aborted) throw new QueryError({ kind: timedOut ? "timeout" : "cancelled", message: timedOut ? serviceText("query_exceeded_the_10_second_timeout") : serviceText("query_cancelled") });
    throw error instanceof QueryError ? error : new QueryError(queryError(error));
  } finally { release?.(); clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
}

function resolveRpcBaseUrl(chain: ChainConfig): string {
  if (!chain.rpcUrl) {
    throw new ServiceError("selected_chain_does_not_provide_rpcurl");
  }
  return chain.rpcUrl;
}

function resolveEvmRpcBaseUrl(chain: ChainConfig): string {
  if (!chain.evmRpcUrl) {
    throw new ServiceError("selected_chain_does_not_provide_evmrpcurl");
  }
  return chain.evmRpcUrl;
}

function getActiveChainConfigForRuntime(): ChainConfig {
  return getActiveChainConfigFromClientCookie();
}

export function queryIdentity(chain: ChainConfig): string { return JSON.stringify([chain.key, chain.chainId, chain.lcdUrl]); }
export function invalidateQueryReads(chain?: ChainConfig) { invalidateSharedReads(chain ? queryIdentity(chain) : undefined); }

async function readObserved<T>(chain: ChainConfig, path: string, signal?: AbortSignal, height?: string, fresh = false) {
  if (fresh) return readObservedUncached<T>(chain, path, signal, height);
  requireModule(chain, path);
  const ttl = /\/denoms_metadata(?:\?|$)|\/params(?:\/[^?]+)?(?:\?|$)/.test(path) ? 30_000 : 0;
  return sharedRead(queryIdentity(chain) + '|' + JSON.stringify([path, height]), ttl, signal,
    sharedSignal => readObservedUncached<T>(chain, path, sharedSignal, height));
}
async function readObservedUncached<T>(chain: ChainConfig, path: string, signal?: AbortSignal, height?: string) {
  try {
    requireModule(chain, path);
    let blockHeight: string | null = null;
    const data = await requestJson<T>(toUrl(chain.lcdUrl, path), height ? { headers: { "x-cosmos-block-height": height } } : {}, {
      signal, onResponse: response => {
        const raw = response.headers.get("x-cosmos-block-height") ?? response.headers.get("grpc-metadata-x-cosmos-block-height");
        blockHeight = raw && /^\d+$/.test(raw) ? raw : null;
      },
    });
    return { data: validateLcdJson(path, data), blockHeight, observedAt: new Date().toISOString() };
  } catch (error) {
    throw new QueryError({ ...queryError(error), endpoint: toUrl(chain.lcdUrl, path) });
  }
}

export const apiClients = {
  lcdGetObserved: <T>(path: string, height?: string, options?: ReadOptions) => readObserved<T>(getActiveChainConfigForRuntime(), path, options?.signal, height),
  get chain() { return getActiveChainConfigForRuntime(); },
  // URL helpers and requests must use the same selected chain.
  lcdUrl: (path: string) => toUrl(getActiveChainConfigForRuntime().lcdUrl, path),
  rpcUrl: (path: string) => toUrl(resolveRpcBaseUrl(getActiveChainConfigForRuntime()), path),
  evmRpcUrl: (path: string) => toUrl(resolveEvmRpcBaseUrl(getActiveChainConfigForRuntime()), path),
  lcdGet: async <T>(path: string, options?: ReadOptions) => (await readObserved<T>(getActiveChainConfigForRuntime(), path, options?.signal)).data,
  rpcGet: async <T>(pathOrUrl: string) => {
    const chain = getActiveChainConfigForRuntime();
    return requestJson<T>(toUrl(resolveRpcBaseUrl(chain), pathOrUrl));
  },
  evmRpcGet: async <T>(pathOrUrl: string) => {
    const chain = getActiveChainConfigForRuntime();
    return requestJson<T>(toUrl(resolveEvmRpcBaseUrl(chain), pathOrUrl));
  },
  rpcJson: async <T>(method: string, params: unknown[] = []) => {
    const chain = getActiveChainConfigForRuntime();
    return requestJson<T>(resolveRpcBaseUrl(chain), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      })
    });
  },
};

export async function getActiveChainRpcUrl(): Promise<string> {
  const chain = getActiveChainConfigForRuntime();
  return resolveRpcBaseUrl(chain);
}

/** Pins every request in a read to the same chain and cancellation signal. */
export function createQueryClient(chain: ChainConfig, signal?: AbortSignal, fresh = false) {
  const observations: QueryObservation[] = [];
  const observed = async <T>(path: string, height?: string, options?: ReadOptions) => {
    const combined = signal && options?.signal ? AbortSignal.any([signal, options.signal]) : signal ?? options?.signal;
    const result = await readObserved<T>(chain, path, combined, height, fresh);
    observations.push({ endpoint: toUrl(chain.lcdUrl, path), observedAt: result.observedAt, blockHeight: result.blockHeight });
    return result;
  };
  return {
    observations,
    signal,
    chain,
    lcdUrl: (path: string) => toUrl(chain.lcdUrl, path),
    rpcUrl: (path: string) => toUrl(resolveRpcBaseUrl(chain), path),
    evmRpcUrl: (path: string) => toUrl(resolveEvmRpcBaseUrl(chain), path),
    lcdGetObserved: observed,
    lcdGet: async <T>(path: string, options?: ReadOptions) => (await observed<T>(path, undefined, options)).data,
    rpcGet: <T>(path: string) => requestJson<T>(toUrl(resolveRpcBaseUrl(chain), path), {}, { signal }),
    evmRpcGet: <T>(path: string) => requestJson<T>(toUrl(resolveEvmRpcBaseUrl(chain), path), {}, { signal }),
    rpcJson: <T>(method: string, params: unknown[] = []) => requestJson<T>(resolveRpcBaseUrl(chain), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }, { signal }),
  };
}
export type QueryClient = Omit<ReturnType<typeof createQueryClient>, "observations" | "signal"> & { observations?: QueryObservation[]; signal?: AbortSignal };
