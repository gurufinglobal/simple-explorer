import { validateLcdJson } from "@/services/lcd-schema";
import { QueryError, queryError } from "@/lib/query-result";
import {
  readPublicEnv,
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

export type ReadOptions = { signal?: AbortSignal; timeoutMs?: number };

export async function requestJson<T>(url: string, init: RequestInit = {}, options: ReadOptions = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 10_000);
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (!response.ok) {
      if (response.status === 404 && /\/cosmos\/auth\/v1beta1\/accounts\//.test(url)) {
        const body = await response.clone().json().catch(() => null) as { code?: number; message?: string } | null;
        if (body?.code === 5 && /account.*not found|unknown address/i.test(body.message ?? "")) {
          throw new QueryError({ kind: "not-found", status: 404, message: "계정이 아직 생성되지 않았습니다. Bank 잔액은 별도로 조회합니다." });
        }
      }
      const retry = response.headers.get("Retry-After");
      const retryAt = retry ? (/^\d+(?:\.\d+)?$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry)) : NaN;
      throw new QueryError({ kind: "http", status: response.status, message: `HTTP ${response.status}: 조회에 실패했습니다.`, ...(Number.isFinite(retryAt) ? { retryAt } : {}) });
    }
    try {
      const body = await response.json() as T;
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      return body;
    }
    catch (error) { if (controller.signal.aborted) throw error; throw new QueryError({ kind: "parse", message: "JSON 응답을 읽을 수 없습니다." }); }
  } catch (error) {
    if (controller.signal.aborted) throw new QueryError({ kind: timedOut ? "timeout" : "cancelled", message: timedOut ? "조회 제한 시간(10초)을 초과했습니다." : "조회가 취소되었습니다." });
    throw error instanceof QueryError ? error : new QueryError(queryError(error));
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
}

function resolveRpcBaseUrl(chain: ChainConfig): string {
  if (!chain.rpcUrl) {
    throw new Error("Selected chain does not provide rpcUrl.");
  }
  return chain.rpcUrl;
}

function resolveEvmRpcBaseUrl(chain: ChainConfig): string {
  if (!chain.evmRpcUrl) {
    throw new Error("Selected chain does not provide evmRpcUrl.");
  }
  return chain.evmRpcUrl;
}

function getActiveChainConfigForRuntime(): ChainConfig {
  return getActiveChainConfigFromClientCookie();
}

export const apiClients = {
  get chain() { return getActiveChainConfigForRuntime(); },
  /**
   * Synchronous URL helpers keep default env behavior.
   * Runtime-selected chain endpoints are applied in async request methods below.
   */
  lcdUrl: (path: string) => toUrl(readPublicEnv().NEXT_PUBLIC_LCD_URL, path),
  rpcUrl: (path: string) => toUrl(readPublicEnv().NEXT_PUBLIC_RPC_URL, path),
  evmRpcUrl: (path: string) => toUrl(readPublicEnv().NEXT_PUBLIC_EVM_RPC_URL, path),
  lcdGet: async <T>(pathOrUrl: string) => {
    const chain = getActiveChainConfigForRuntime();
    return validateLcdJson(pathOrUrl, await requestJson<T>(toUrl(chain.lcdUrl, pathOrUrl)));
  },
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
export function createQueryClient(chain: ChainConfig, signal?: AbortSignal) {
  return {
    ...apiClients,
    chain,
    lcdGet: async <T>(path: string) => validateLcdJson(path, await requestJson<T>(toUrl(chain.lcdUrl, path), {}, { signal })),
    rpcGet: <T>(path: string) => requestJson<T>(toUrl(resolveRpcBaseUrl(chain), path), {}, { signal }),
    evmRpcGet: <T>(path: string) => requestJson<T>(toUrl(resolveEvmRpcBaseUrl(chain), path), {}, { signal }),
    rpcJson: <T>(method: string, params: unknown[] = []) => requestJson<T>(resolveRpcBaseUrl(chain), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }, { signal }),
  };
}
export type QueryClient = ReturnType<typeof createQueryClient>;
