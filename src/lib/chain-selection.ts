import {
  getChainByKey,
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
  const selected = getActiveChainKeyFromClientCookie() ?? getDefaultChainKey();
  const chain = getChainByKey(selected);
  if (!chain) throw new Error(`선택 체인 '${selected}' 설정이 없습니다. 체인을 다시 선택하세요.`);
  return chain;
}

export function setActiveChainKeyCookie(key: string): void {
  if (typeof document === "undefined") {
    return;
  }
  if (!getChainByKey(key)) throw new Error("등록되지 않은 체인입니다.");
  let previous: string | null = null;
  try { previous = getActiveChainKeyFromClientCookie(); } catch { /* An explicit selection replaces a malformed cookie. */ }
  document.cookie = `${ACTIVE_CHAIN_COOKIE}=${encodeURIComponent(key)}; path=/; max-age=31536000; samesite=lax`;
  if (previous !== key) window.dispatchEvent(new Event("explorer:chain-changed"));
}

export function getActiveChainConfig(): ChainConfig {
  return getActiveChainConfigFromClientCookie();
}
