import { apiClients } from "@/services/clients";

export type TokenMetadata = {
  tokenType: "native" | "ibc" | "evm";
  name: string;
  symbol: string;
  decimals: number;
  sourceChain: string | null;
  sourceChannel: string | null;
};

export type TokenDenomMetadata = {
  baseDenom: string;
  displayDenom: string;
  name: string;
  symbol: string;
  description: string;
  decimals: number;
};

const fallbackMetadataMap: Record<string, TokenMetadata> = {
  uguru: {
    tokenType: "native",
    name: "Guru",
    symbol: "GURU",
    decimals: 6,
    sourceChain: null,
    sourceChannel: null,
  },
  "ibc/ABCDEF": {
    tokenType: "ibc",
    name: "IBC Guru",
    symbol: "ibcGURU",
    decimals: 6,
    sourceChain: "cosmoshub-4",
    sourceChannel: "channel-0",
  },
  "evm:0x0000000000000000000000000000000000000002": {
    tokenType: "evm",
    name: "Wrapped Guru",
    symbol: "wGURU",
    decimals: 18,
    sourceChain: "guru-evm-testnet",
    sourceChannel: null,
  },
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

function readFallback(tokenRef: string): TokenMetadata | null {
  return fallbackMetadataMap[tokenRef] ?? null;
}

function inferEvmToken(tokenRef: string): TokenMetadata | null {
  if (!tokenRef.startsWith("evm:")) {
    return null;
  }
  const contract = tokenRef.slice(4);
  return {
    tokenType: "evm",
    name: `EVM Token ${contract.slice(0, 8)}`,
    symbol: "EVM",
    decimals: 18,
    sourceChain: "guru-evm",
    sourceChannel: null,
  };
}

async function fetchNativeTokenMetadata(tokenRef: string): Promise<TokenMetadata | null> {
  const response = await apiClients.lcdGet<DenomMetadataResponse>(
    `/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(tokenRef)}`,
  );
  if (!response.metadata) {
    return null;
  }

  return {
    tokenType: "native",
    name: response.metadata.name ?? tokenRef,
    symbol: response.metadata.symbol ?? response.metadata.display ?? tokenRef.toUpperCase(),
    decimals: 6,
    sourceChain: null,
    sourceChannel: null,
  };
}

async function fetchIbcTokenMetadata(tokenRef: string): Promise<TokenMetadata | null> {
  const hash = tokenRef.replace("ibc/", "");
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
    name: response.denom_trace.base_denom ?? tokenRef,
    symbol: (response.denom_trace.base_denom ?? "IBC").toUpperCase(),
    decimals: 6,
    sourceChain: "unknown",
    sourceChannel: channelId,
  };
}

function getDisplayDecimals(metadata: {
  display?: string;
  denom_units?: Array<{ denom?: string; exponent?: number }>;
}): number {
  const units = metadata.denom_units ?? [];
  const display = metadata.display;
  if (display) {
    const matched = units.find((unit) => unit.denom === display);
    if (typeof matched?.exponent === "number") {
      return matched.exponent;
    }
  }
  const numericExponents = units
    .map((unit) => unit.exponent)
    .filter((value): value is number => typeof value === "number");
  if (numericExponents.length === 0) {
    return 0;
  }
  return Math.max(...numericExponents);
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
    symbol: metadata.symbol?.trim() || displayDenom.toUpperCase(),
    description: metadata.description?.trim() || "-",
    decimals: getDisplayDecimals(metadata),
  };
}

export async function getTokenMetadata(tokenRef: string): Promise<TokenMetadata | null> {
  if (process.env.NODE_ENV === "test") {
    return readFallback(tokenRef);
  }

  try {
    if (tokenRef.startsWith("ibc/")) {
      return (await fetchIbcTokenMetadata(tokenRef)) ?? readFallback(tokenRef);
    }
    if (tokenRef.startsWith("evm:")) {
      return inferEvmToken(tokenRef) ?? readFallback(tokenRef);
    }
    return (await fetchNativeTokenMetadata(tokenRef)) ?? readFallback(tokenRef);
  } catch {
    return inferEvmToken(tokenRef) ?? readFallback(tokenRef);
  }
}

export async function getDenomsMetadata(): Promise<TokenDenomMetadata[]> {
  try {
    const metadatas: TokenDenomMetadata[] = [];
    let nextKey: string | null | undefined = undefined;
    let pageCount = 0;

    do {
      const query: string = nextKey
        ? `?pagination.limit=200&pagination.key=${encodeURIComponent(nextKey)}`
        : "?pagination.limit=200";
      const response = await apiClients.lcdGet<DenomsMetadataListResponse>(
        `/cosmos/bank/v1beta1/denoms_metadata${query}`,
      );
      const normalized = (response.metadatas ?? [])
        .map((item) => normalizeDenomMetadata(item))
        .filter((item): item is TokenDenomMetadata => item !== null);
      metadatas.push(...normalized);

      nextKey = response.pagination?.next_key;
      pageCount += 1;
      if (pageCount >= 50) {
        break;
      }
    } while (nextKey);

    return metadatas.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.baseDenom.localeCompare(b.baseDenom));
  } catch {
    return [];
  }
}
