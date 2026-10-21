import {
  getChainByKey,
  getDefaultChainKey,
  type ChainConfig,
} from "@/lib/env";

let chainGeneration = 0;
export function getChainSelectionGeneration(): number { return chainGeneration; }

export const ACTIVE_CHAIN_COOKIE = "gf_chain";

function parseCookieValue(rawCookie: string, key: string): string | null {
  const found = rawCookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`));
  if (!found) {
    return null;
  }
  try { return decodeURIComponent(found.slice(key.length + 1)); }
  catch { throw new Error("저장된 체인 key를 읽을 수 없습니다. 체인을 다시 선택하세요."); }
}

export function getActiveChainKeyFromClientCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  return parseCookieValue(document.cookie, ACTIVE_CHAIN_COOKIE);
}

export function getActiveChainConfigFromClientCookie(): ChainConfig {
  const urlKey = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("chain");
  return resolveChainContext(urlKey, urlKey === null ? getActiveChainKeyFromClientCookie() : null);
}

export function setActiveChainKeyCookie(key: string): void {
  if (typeof document === "undefined") {
    return;
  }
  if (!getChainByKey(key)) throw new Error("등록되지 않은 체인입니다.");
  let previous: string | null = null;
  try { previous = getActiveChainKeyFromClientCookie(); } catch { /* An explicit selection replaces a malformed cookie. */ }
  document.cookie = `${ACTIVE_CHAIN_COOKIE}=${encodeURIComponent(key)}; path=/; max-age=31536000; samesite=lax`;
  if (previous !== key) { chainGeneration += 1; window.dispatchEvent(new Event("explorer:chain-changed")); }
}

export function getActiveChainConfig(): ChainConfig {
  return getActiveChainConfigFromClientCookie();
}

/** Resolves explicit server/API URL context before cookie/default. Unknown keys fail closed. */
export function resolveChainContext(urlKey: string | null, cookieKey: string | null = null): ChainConfig {
  const selected = urlKey ?? cookieKey ?? getDefaultChainKey();
  const chain = getChainByKey(selected);
  if (!chain) throw new Error(`선택 체인 '${selected}' 설정이 없습니다. 체인을 다시 선택하세요.`);
  return chain;
}

export function withChain(href: string, key?: string): string {
  const url = new URL(href, "https://explorer.invalid");
  if (!url.searchParams.has("chain")) url.searchParams.set("chain", key ?? getActiveChainConfig().key);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Called by the route boundary before mounting readers; also handles back/forward. */
let announcedChain: string | null = null;
export function synchronizeRouteChain(): void {
  let key: string | null = null;
  try { key = getActiveChainConfig().key; } catch { /* Invalid routes invalidate sessions too. */ }
  if (key) document.cookie = `${ACTIVE_CHAIN_COOKIE}=${encodeURIComponent(key)}; path=/; max-age=31536000; samesite=lax`;
  if (announcedChain !== key) {
    announcedChain = key;
    chainGeneration += 1;
    window.dispatchEvent(new Event("explorer:chain-changed"));
  }
}


export function selectActiveChain(key: string): void {
  if (!getChainByKey(key)) throw new Error("등록되지 않은 체인입니다.");
  const url = new URL(window.location.href);
  url.searchParams.set("chain", key);
  window.history.pushState(null, "", url);
  setActiveChainKeyCookie(key);
  synchronizeRouteChain();
}
