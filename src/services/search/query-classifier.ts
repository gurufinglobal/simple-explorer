
import { ServiceError, serviceText } from '@/i18n/service-message';
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
  if (!/^(?:0x)?[0-9a-f]{64}$/i.test(value)) throw new ServiceError("cosmos_transaction_hash_must_be_64_hex_characters_the_0x");
  return value.replace(/^0x/i, "").toUpperCase();
}
export function normalizeBlockHeight(value: string): string {
  if (!/^[1-9][0-9]*$/.test(value)) throw new ServiceError("block_height_must_be_a_positive_integer");
  return value; // Never round a height through Number.
}
export function classifyQuery(query: string, chain: ChainConfig = getActiveChainConfig()): SearchResolution {
  const candidates: ResolvedType[] = [];
  const result = (normalized = query, error: string | null = null): SearchResolution => ({
    resolvedType: candidates[0] ?? null, hasConflict: candidates.length > 1, candidates, normalized, error,
  });
  if (!query || /\s/.test(query)) return result(query, serviceText("enter_a_search_query_without_whitespace"));
  if (/^(validator|[a-z]+valoper1)/i.test(query)) { candidates.push("validator"); return result(query, serviceText("validator_search_is_not_supported_yet")); }
  if (/^token:/i.test(query)) { candidates.push("token"); return result(query, serviceText("token_search_is_not_supported_yet")); }
  if (/^(?:0x)?[0-9a-f]{64}$/i.test(query)) candidates.push("txHash");
  if (/^[1-9][0-9]*$/.test(query)) candidates.push("blockHeight");
  if (candidates.length) return result(candidates[0] === "txHash" ? normalizeCosmosTxHash(query) : query);
  if (/^0x/i.test(query) || /^[a-z0-9]+1/i.test(query)) {
    try { const normalized = canonicalAccountAddress(query, chain); candidates.push("address"); return result(normalized); }
    catch (error) { return result(query, (error as Error).message); }
  }
  return result(query, serviceText("only_positive_block_heights_cosmos_transaction_hashes_hex_and_account"));
}
export function searchHref(resolution: SearchResolution, candidate: ResolvedType, chain: ChainConfig): string {
  if (resolution.error || !resolution.candidates.includes(candidate)) throw new Error(resolution.error ?? serviceText("select_a_valid_search_candidate"));
  const path = { txHash: "tx", blockHeight: "blocks", address: "address", validator: "", token: "" }[candidate];
  if (!path) throw new ServiceError("unsupported_search_type");
  return withChain(`/${path}/${encodeURIComponent(resolution.normalized)}`, chain.key);
}
