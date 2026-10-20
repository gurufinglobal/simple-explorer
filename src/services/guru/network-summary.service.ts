import { PartialQueryError, combinedError, schemaError } from "@/lib/query-result";
import { formatBaseAmount } from "@/lib/cosmos-amount";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";

export type NetworkSummary = {
  chainId: string;
  blockHeight: number | null;
  averageBlockTimeSec: number | null;
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

async function fetchAverageBlockTimeRecent(latestHeight: number, sampleBlocks = 10, apiClients: QueryClient = defaultClients): Promise<number | null> {
  if (latestHeight <= 1) {
    return null;
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
    schemaError("블록 간격 표본이 올바르지 않습니다.");
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
    schemaError("블록 간격 표본이 올바르지 않습니다.");
  }
  return Number(((sumDiffMs / count) / 1000).toFixed(2));
}

export async function getNetworkSummary(apiClients: QueryClient = defaultClients): Promise<NetworkSummary> {
  const activeChain = apiClients.chain;
  const baseDenom = activeChain.denom ?? DEFAULT_BASE_DENOM;
  const displayDenom = toDisplayDenom(baseDenom);

  const summary: NetworkSummary = { chainId: activeChain.key, blockHeight: null, averageBlockTimeSec: null, supply: "-", bonded: "-", inflation: "-" };
  const results = await Promise.allSettled([
    apiClients.lcdGet<LcdBlockResponse>("/cosmos/base/tendermint/v1beta1/blocks/latest").then(async latest => {
      const height = Number(latest.block?.header?.height);
      if (!Number.isSafeInteger(height) || height < 1 || !latest.block?.header?.chain_id) schemaError();
      summary.blockHeight = height;
      summary.chainId = latest.block.header.chain_id;
      summary.averageBlockTimeSec = await fetchAverageBlockTimeRecent(height, 10, apiClients);
    }),
    apiClients.lcdGet<SupplyResponse>(`/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(baseDenom)}`).then(res => {
      if (!res.amount?.amount || !/^\d+$/.test(res.amount.amount)) schemaError();
      summary.supply = formatBaseAmount(res.amount.amount, displayDenom);
    }),
    apiClients.lcdGet<PoolResponse>("/cosmos/staking/v1beta1/pool").then(res => {
      if (!res.pool?.bonded_tokens || !/^\d+$/.test(res.pool.bonded_tokens)) schemaError();
      summary.bonded = formatBaseAmount(res.pool.bonded_tokens, displayDenom);
    }),
    apiClients.lcdGet<InflationResponse>("/cosmos/mint/v1beta1/inflation").then(res => {
      if (typeof res.inflation !== "string" || !/^\d+(?:\.\d+)?$/.test(res.inflation)) schemaError();
      summary.inflation = formatInflation(res.inflation);
    }),
  ]);
  const failed = results.find(r => r.status === "rejected");
  if (failed?.status === "rejected") {
    if (results.some(r => r.status === "fulfilled") || summary.blockHeight !== null) throw new PartialQueryError(summary, combinedError(results.flatMap(r => r.status === "rejected" ? [r.reason] : [])));
    throw failed.reason;
  }
  return summary;
}

export async function getApplicationVersions(apiClients: QueryClient = defaultClients): Promise<ApplicationVersionItem[]> {
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
}

export async function getAccountsTotal(apiClients: QueryClient = defaultClients): Promise<string | null> {
  const response = await apiClients.lcdGet<AuthAccountsTotalResponse>(
    "/cosmos/auth/v1beta1/accounts?pagination.limit=1&pagination.count_total=true",
  );
  const raw = response.pagination?.total?.trim() ?? "";
  if (!/^[0-9]+$/.test(raw)) {
    schemaError("계정 총계 응답이 올바르지 않습니다.");
  }
  return raw;
}
