
import { serviceText, serviceMessage } from '@/i18n/service-message';
import { PartialQueryError, QueryError, queryError, schemaError } from "@/lib/query-result";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";

export type TokenMetadata = {
  tokenType: "native" | "ibc" | "evm";
  name: string;
  symbol: string;
  decimals: number | null;
  sourceChain: string | null;
  sourceChannel: string | null;
};

export type TokenDenomMetadata = {
  baseDenom: string;
  displayDenom: string;
  name: string;
  symbol: string;
  description: string;
  decimals: number | null;
};

type DenomMetadataResponse = {
  metadata?: {
    description?: string;
    denom_units?: Array<{
      denom?: string;
      exponent?: number;
    }>;
    base?: string;
    name?: string;
    symbol?: string;
    display?: string;
  };
};

type DenomsMetadataListResponse = {
  metadatas?: Array<{
    description?: string;
    denom_units?: Array<{
      denom?: string;
      exponent?: number;
    }>;
    base?: string;
    display?: string;
    name?: string;
    symbol?: string;
  }>;
  pagination?: {
    next_key?: string | null;
  };
};

type DenomTraceResponse = {
  denom_trace?: {
    path?: string;
    base_denom?: string;
  };
};

async function fetchNativeTokenMetadata(tokenRef: string, apiClients: QueryClient = defaultClients): Promise<TokenMetadata | null> {
  const response = await apiClients.lcdGet<DenomMetadataResponse>(
    `/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(tokenRef)}`,
  );
  if (!response.metadata) {
    return null;
  }

  return {
    tokenType: "native",
    name: response.metadata.name ?? serviceText("unknown"),
    symbol: response.metadata.symbol ?? serviceText("unknown"),
    decimals: getDisplayDecimals(response.metadata),
    sourceChain: null,
    sourceChannel: null,
  };
}

async function fetchIbcTokenMetadata(tokenRef: string, apiClients: QueryClient = defaultClients): Promise<TokenMetadata | null> {
  const hash = tokenRef.replace(/^ibc[:/]/, "");
  const response = await apiClients.lcdGet<DenomTraceResponse>(
    `/ibc/apps/transfer/v1/denom_traces/${encodeURIComponent(hash)}`,
  );
  if (!response.denom_trace) {
    return null;
  }

  const pathParts = (response.denom_trace.path ?? "").split("/");
  const channelId = pathParts.find((part) => part.startsWith("channel-")) ?? null;

  return {
    tokenType: "ibc",
    name: serviceText("unknown"),
    symbol: serviceText("unknown"),
    decimals: null,
    sourceChain: "unknown",
    sourceChannel: channelId,
  };
}

function getDisplayDecimals(metadata: {
  display?: string;
  denom_units?: Array<{ denom?: string; exponent?: number }>;
}): number | null {
  if (!metadata.display) return null;
  const matches = metadata.denom_units?.filter(unit => unit.denom === metadata.display) ?? [];
  const exponent = matches.length === 1 ? matches[0].exponent : undefined;
  return typeof exponent === "number" && Number.isInteger(exponent) && exponent >= 0 && exponent <= 255 ? exponent : null;
}

function normalizeDenomMetadata(metadata: {
  description?: string;
  denom_units?: Array<{
    denom?: string;
    exponent?: number;
  }>;
  base?: string;
  display?: string;
  name?: string;
  symbol?: string;
}): TokenDenomMetadata | null {
  const baseDenom = metadata.base?.trim();
  if (!baseDenom) {
    return null;
  }
  const displayDenom = metadata.display?.trim() || baseDenom;
  return {
    baseDenom,
    displayDenom,
    name: metadata.name?.trim() || baseDenom,
    symbol: metadata.symbol?.trim() || displayDenom,
    description: metadata.description?.trim() || "-",
    decimals: getDisplayDecimals(metadata),
  };
}

export async function getTokenMetadata(tokenRef: string, apiClients: QueryClient = defaultClients): Promise<TokenMetadata | null> {
  if (tokenRef.startsWith("evm:")) throw new QueryError({ kind: "unsupported", ...serviceMessage("evm_token_metadata_queries_are_not_implemented") });
  return tokenRef.startsWith("ibc:") || tokenRef.startsWith("ibc/") ? fetchIbcTokenMetadata(tokenRef, apiClients) : fetchNativeTokenMetadata(tokenRef, apiClients);
}

export async function getDenomsMetadata(apiClients: QueryClient = defaultClients): Promise<TokenDenomMetadata[]> {
  const metadatas: TokenDenomMetadata[] = [];
  try {
    let nextKey: string | null | undefined = undefined;
    let pageCount = 0;
    const seen = new Set<string>();

    do {
      const query: string = nextKey
        ? `?pagination.limit=200&pagination.key=${encodeURIComponent(nextKey)}`
        : "?pagination.limit=200";
      const response = await apiClients.lcdGet<DenomsMetadataListResponse>(
        `/cosmos/bank/v1beta1/denoms_metadata${query}`,
      );
      const normalized = (response.metadatas ?? schemaError())
        .map((item) => normalizeDenomMetadata(item))
        .filter((item): item is TokenDenomMetadata => item !== null);
      metadatas.push(...normalized);

      nextKey = response.pagination?.next_key;
      pageCount += 1;
      if (nextKey && seen.has(nextKey)) {
        throw new QueryError({ kind: "incomplete", ...serviceMessage("stopped_after_detecting_a_repeated_or_cyclic_metadata_cursor_results") });
      }
      if (nextKey) seen.add(nextKey);
      if (pageCount >= 50 && nextKey) {
        throw new QueryError({ kind: "incomplete", ...serviceMessage("reached_the_metadata_query_limit_50_pages_results_are_partial") });
      }
    } while (nextKey);

    return Array.from(new Map(metadatas.map(row => [row.baseDenom, row])).values()).sort((a, b) => a.symbol.localeCompare(b.symbol) || a.baseDenom.localeCompare(b.baseDenom));
  } catch (error) {
    if (metadatas.length) throw new PartialQueryError(Array.from(new Map(metadatas.map(row => [row.baseDenom, row])).values()), queryError(error));
    throw error;
  }
}
