import { getActiveChainConfig } from "@/lib/chain-selection";
import type { ChainConfig } from "@/lib/env";
import { classifyQuery, type SearchResolution } from "@/services/search/query-classifier";
import type { HandlerResult } from "./types";

export type SearchResolvePayload = SearchResolution | { message: string };
export function resolveSearch(queryInput?: string, chain?: ChainConfig): HandlerResult<SearchResolvePayload> {
  try {
    const result = classifyQuery(queryInput ?? "", chain ?? getActiveChainConfig());
    return result.error
      ? { status: result.resolvedType === "validator" || result.resolvedType === "token" ? 422 : 400, body: { message: result.error } }
      : { status: 200, body: result };
  } catch (error) { return { status: 400, body: { message: (error as Error).message } }; }
}
