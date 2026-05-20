import { sanitizeInput } from "@/lib/sanitize";
import { classifyQuery } from "@/services/search/query-classifier";
import type { HandlerResult } from "./types";

export type SearchResolvePayload =
  | {
      resolvedType: "txHash" | "address" | "blockHeight" | "validator" | "token";
      hasConflict: boolean;
      candidates: ("txHash" | "address" | "blockHeight" | "validator" | "token")[];
    }
  | { message: string };

export function resolveSearch(queryInput?: string): HandlerResult<SearchResolvePayload> {
  const query = sanitizeInput(queryInput ?? "");
  if (!query) {
    return {
      status: 400,
      body: { message: "query는 필수입니다." },
    };
  }

  return {
    status: 200,
    body: classifyQuery(query),
  };
}
