import {
  readPublicEnv,
  type ChainConfig,
} from "@/lib/env";
import { getActiveChainConfig as getActiveChainConfigFromClientCookie } from "@/lib/chain-selection";

type JsonObject = Record<string, unknown>;

function toUrl(base: string, pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith("/")) {
    return `${base}${pathOrUrl}`;
  }
  return `${base}/${pathOrUrl}`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function postJson<T>(url: string, body: JsonObject): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return (await response.json()) as T;
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
  /**
   * Synchronous URL helpers keep default env behavior.
   * Runtime-selected chain endpoints are applied in async request methods below.
   */
  lcdUrl: (path: string) => toUrl(readPublicEnv().NEXT_PUBLIC_LCD_URL, path),
  rpcUrl: (path: string) => toUrl(readPublicEnv().NEXT_PUBLIC_RPC_URL, path),
  evmRpcUrl: (path: string) => toUrl(readPublicEnv().NEXT_PUBLIC_EVM_RPC_URL, path),
  lcdGet: async <T>(pathOrUrl: string) => {
    const chain = getActiveChainConfigForRuntime();
    return getJson<T>(toUrl(chain.lcdUrl, pathOrUrl));
  },
  rpcGet: async <T>(pathOrUrl: string) => {
    const chain = getActiveChainConfigForRuntime();
    return getJson<T>(toUrl(resolveRpcBaseUrl(chain), pathOrUrl));
  },
  evmRpcGet: async <T>(pathOrUrl: string) => {
    const chain = getActiveChainConfigForRuntime();
    return getJson<T>(toUrl(resolveEvmRpcBaseUrl(chain), pathOrUrl));
  },
  rpcJson: async <T>(method: string, params: unknown[] = []) => {
    const chain = getActiveChainConfigForRuntime();
    return postJson<T>(resolveRpcBaseUrl(chain), {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });
  },
};

export async function getActiveChainRpcUrl(): Promise<string> {
  const chain = getActiveChainConfigForRuntime();
  return resolveRpcBaseUrl(chain);
}
