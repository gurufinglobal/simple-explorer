import { canonicalAccountAddress } from "@/lib/canonical-address";
import { getActiveChainConfig, withChain } from "@/lib/chain-selection";
import type { ChainConfig } from "@/lib/env";

export type ResolvedType = "txHash" | "address" | "blockHeight" | "validator" | "token";
export type SearchResolution = {
  resolvedType: ResolvedType | null;
  hasConflict: boolean;
  candidates: ResolvedType[];
  normalized: string;
  error: string | null;
};

export function normalizeCosmosTxHash(value: string): string {
  if (!/^(?:0x)?[0-9a-f]{64}$/i.test(value)) throw new Error("Cosmos tx hash는 64자리 hex여야 합니다. 0x 접두는 생략할 수 있습니다.");
  return value.replace(/^0x/i, "").toUpperCase();
}
export function normalizeBlockHeight(value: string): string {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("블록 높이는 0보다 큰 정수여야 합니다.");
  return value; // Never round a height through Number.
}
export function classifyQuery(query: string, chain: ChainConfig = getActiveChainConfig()): SearchResolution {
  const candidates: ResolvedType[] = [];
  const result = (normalized = query, error: string | null = null): SearchResolution => ({
    resolvedType: candidates[0] ?? null, hasConflict: candidates.length > 1, candidates, normalized, error,
  });
  if (!query || /\s/.test(query)) return result(query, "검색어는 공백 없이 입력하세요.");
  if (/^(validator|[a-z]+valoper1)/i.test(query)) { candidates.push("validator"); return result(query, "validator 검색은 아직 지원하지 않습니다."); }
  if (/^token:/i.test(query)) { candidates.push("token"); return result(query, "token 검색은 아직 지원하지 않습니다."); }
  if (/^(?:0x)?[0-9a-f]{64}$/i.test(query)) candidates.push("txHash");
  if (/^[1-9][0-9]*$/.test(query)) candidates.push("blockHeight");
  if (candidates.length) return result(candidates[0] === "txHash" ? normalizeCosmosTxHash(query) : query);
  if (/^0x/i.test(query) || /^[a-z0-9]+1/i.test(query)) {
    try { const normalized = canonicalAccountAddress(query, chain); candidates.push("address"); return result(normalized); }
    catch (error) { return result(query, (error as Error).message); }
  }
  return result(query, "양의 블록 높이, Cosmos tx hash(hex), 선택 체인의 계정 주소만 지원합니다.");
}
export function searchHref(resolution: SearchResolution, candidate: ResolvedType, chain: ChainConfig): string {
  if (resolution.error || !resolution.candidates.includes(candidate)) throw new Error(resolution.error ?? "유효한 검색 후보를 선택하세요.");
  const path = { txHash: "tx", blockHeight: "blocks", address: "address", validator: "", token: "" }[candidate];
  if (!path) throw new Error("지원하지 않는 검색 유형입니다.");
  return withChain(`/${path}/${encodeURIComponent(resolution.normalized)}`, chain.key);
}
