import { formatBaseAmount } from "@/lib/cosmos-amount";
import { apiClients } from "@/services/clients";
import { getActiveChainConfig } from "@/lib/chain-selection";

export type NetworkSummary = {
  chainId: string;
  blockHeight: number;
  averageBlockTimeSec: number;
  supply: string;
  bonded: string;
  inflation: string;
};

type LcdBlockResponse = {
  block?: {
    header?: {
      height?: string;
      time?: string;
      chain_id?: string;
    };
  };
};

type SupplyResponse = {
  amount?: {
    amount?: string;
    denom?: string;
  };
};

type PoolResponse = {
  pool?: {
    bonded_tokens?: string;
  };
};

type InflationResponse = {
  inflation?: string;
};

type AuthAccountsTotalResponse = {
  pagination?: {
    total?: string;
  };
};

type NodeInfoResponse = {
  default_node_info?: {
    network?: string;
    moniker?: string;
    version?: string;
    other?: {
      rpc_address?: string;
    };
  };
  application_version?: {
    app_name?: string;
    version?: string;
    git_commit?: string;
    cosmos_sdk_version?: string;
    go_version?: string;
  };
};

export type ApplicationVersionItem = {
  name: string;
  version: string;
};

const DEFAULT_BASE_DENOM = "agxn";

function toDisplayDenom(baseDenom: string): string {
  return baseDenom.startsWith("a") && baseDenom.length > 1 ? baseDenom.slice(1) : baseDenom;
}

function formatInflation(raw: string): string {
  const numeric = Number(raw);
  if (Number.isNaN(numeric)) {
    return raw;
  }
  return `${(numeric * 100).toFixed(2)}%`;
}

async function fetchAverageBlockTimeRecent(latestHeight: number, sampleBlocks = 10): Promise<number> {
  if (latestHeight <= 1) {
    return 0;
  }
  const start = Math.max(1, latestHeight - sampleBlocks + 1);
  const heights: number[] = [];
  for (let h = latestHeight; h >= start; h--) {
    heights.push(h);
  }
  const blocks = await Promise.all(
    heights.map((height) =>
      apiClients.lcdGet<LcdBlockResponse>(
        `/cosmos/base/tendermint/v1beta1/blocks/${height}`,
      ),
    ),
  );
  const timesMs = blocks
    .map((item) => item.block?.header?.time)
    .map((iso) => (iso ? Date.parse(iso) : Number.NaN))
    .filter((ms) => Number.isFinite(ms));

  if (timesMs.length < 2) {
    return 0;
  }

  let sumDiffMs = 0;
  let count = 0;
  for (let i = 0; i < timesMs.length - 1; i++) {
    const diff = timesMs[i] - timesMs[i + 1];
    if (diff > 0) {
      sumDiffMs += diff;
      count += 1;
    }
  }
  if (count === 0) {
    return 0;
  }
  return Number(((sumDiffMs / count) / 1000).toFixed(2));
}

export async function getNetworkSummary(): Promise<NetworkSummary> {
  const activeChain = getActiveChainConfig();
  const baseDenom = activeChain.denom ?? DEFAULT_BASE_DENOM;
  const displayDenom = toDisplayDenom(baseDenom);

  let latestHeight = 0;
  let chainId = "unknown";

  try {
    const latestBlock = await apiClients.lcdGet<LcdBlockResponse>(
      "/cosmos/base/tendermint/v1beta1/blocks/latest",
    );
    latestHeight = Number(latestBlock.block?.header?.height ?? "0");
    chainId = latestBlock.block?.header?.chain_id ?? "unknown";
  } catch {
    latestHeight = 0;
    chainId = "unknown";
  }

  let averageBlockTimeSec = 0;
  if (latestHeight > 0) {
    try {
      averageBlockTimeSec = await fetchAverageBlockTimeRecent(latestHeight, 10);
    } catch {
      averageBlockTimeSec = 0;
    }
  }

  const [supplyResult, poolResult, inflationResult] = await Promise.allSettled([
    apiClients.lcdGet<SupplyResponse>(`/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(baseDenom)}`),
    apiClients.lcdGet<PoolResponse>("/cosmos/staking/v1beta1/pool"),
    apiClients.lcdGet<InflationResponse>("/cosmos/mint/v1beta1/inflation"),
  ]);

  const supplyAmount =
    supplyResult.status === "fulfilled"
      ? supplyResult.value.amount?.amount
      : undefined;
  const bondedAmount =
    poolResult.status === "fulfilled"
      ? poolResult.value.pool?.bonded_tokens
      : undefined;
  const inflationRaw =
    inflationResult.status === "fulfilled"
      ? inflationResult.value.inflation
      : undefined;

  return {
    chainId,
    blockHeight: latestHeight,
    averageBlockTimeSec,
    supply: formatBaseAmount(supplyAmount, displayDenom),
    bonded: formatBaseAmount(bondedAmount, displayDenom),
    inflation: formatInflation(inflationRaw ?? "0"),
  };
}

export async function getApplicationVersions(): Promise<ApplicationVersionItem[]> {
  try {
    const nodeInfo = await apiClients.lcdGet<NodeInfoResponse>(
      "/cosmos/base/tendermint/v1beta1/node_info",
    );
    const defaultInfo = nodeInfo.default_node_info;
    const app = nodeInfo.application_version;

    return [
      { name: "network", version: defaultInfo?.network ?? "-" },
      { name: "moniker", version: defaultInfo?.moniker ?? "-" },
      { name: "tendermint", version: defaultInfo?.version ?? "-" },
      { name: "rpc_address", version: defaultInfo?.other?.rpc_address ?? "-" },
      { name: "app_name", version: app?.app_name ?? "-" },
      { name: "version", version: app?.version ?? "-" },
      { name: "git_commit", version: app?.git_commit ?? "-" },
      { name: "cosmos_sdk_version", version: app?.cosmos_sdk_version ?? "-" },
      { name: "go_version", version: app?.go_version ?? "-" },
    ];
  } catch {
    return [
      { name: "network", version: "-" },
      { name: "app_name", version: "-" },
      { name: "version", version: "-" },
    ];
  }
}

export async function getAccountsTotal(): Promise<string | null> {
  try {
    const response = await apiClients.lcdGet<AuthAccountsTotalResponse>(
      "/cosmos/auth/v1beta1/accounts?pagination.limit=1&pagination.count_total=true",
    );
    const raw = response.pagination?.total?.trim() ?? "";
    if (!/^[0-9]+$/.test(raw)) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}
