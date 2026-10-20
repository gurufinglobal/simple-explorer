import {
  getChainByKey,
  getConfiguredChains,
  getDefaultChainKey,
  type ChainConfig,
} from "@/lib/env";

export const ACTIVE_CHAIN_COOKIE = "gf_chain";

function parseCookieValue(rawCookie: string, key: string): string | null {
  const found = rawCookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`));
  if (!found) {
    return null;
  }
  return decodeURIComponent(found.slice(key.length + 1));
}

export function getActiveChainKeyFromClientCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  return parseCookieValue(document.cookie, ACTIVE_CHAIN_COOKIE);
}

export function getActiveChainConfigFromClientCookie(): ChainConfig {
  const selected = getActiveChainKeyFromClientCookie();
  const resolved = getChainByKey(selected);
  if (resolved) {
    return resolved;
  }
  const fallback = getChainByKey(getDefaultChainKey());
  if (fallback) {
    return fallback;
  }
  return getConfiguredChains()[0];
}

export function setActiveChainKeyCookie(key: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const previous = getActiveChainKeyFromClientCookie();
  document.cookie = `${ACTIVE_CHAIN_COOKIE}=${encodeURIComponent(key)}; path=/; max-age=31536000; samesite=lax`;
  if (previous !== key) window.dispatchEvent(new Event("explorer:chain-changed"));
}

export function getActiveChainConfig(): ChainConfig {
  const selected = getActiveChainKeyFromClientCookie();
  const resolved = getChainByKey(selected);
  if (resolved) {
    return resolved;
  }
  const fallback = getChainByKey(getDefaultChainKey());
  if (fallback) {
    return fallback;
  }
  return getConfiguredChains()[0];
}
