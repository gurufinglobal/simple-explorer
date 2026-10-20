import { PartialQueryError, QueryError, combinedError } from "@/lib/query-result";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";

export type BexCoin = {
  denom: string;
  amount: string;
};

export type BexExchange = {
  id: string;
  adminAddress: string;
  reserveAddress: string;
  denomA: string;
  ibcDenomA: string;
  portA: string;
  channelA: string;
  denomB: string;
  ibcDenomB: string;
  portB: string;
  channelB: string;
  fee: string;
  limit: string;
  oracleRequestId: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

export type BexExchangeFees = {
  collected: BexCoin[];
  locked: BexCoin[];
  available: BexCoin[];
  hasCollectedError: boolean;
  hasLockedError: boolean;
  hasAvailableError: boolean;
};

type BexExchangeRaw = {
  id?: string;
  admin_address?: string;
  reserve_address?: string;
  denom_a?: string;
  ibc_denom_a?: string;
  port_a?: string;
  channel_a?: string;
  denom_b?: string;
  ibc_denom_b?: string;
  port_b?: string;
  channel_b?: string;
  fee?: string;
  limit?: string;
  oracle_request_id?: string;
  status?: string;
  metadata?: Record<string, unknown> | null;
};

type BexExchangesResponse = {
  exchanges?: BexExchangeRaw[];
};

type BexCoinsResponse = {
  coins?: Array<{
    denom?: string;
    amount?: string;
  }>;
};

function normalizeExchange(raw: BexExchangeRaw): BexExchange {
  return {
    id: raw.id ?? "0",
    adminAddress: raw.admin_address ?? "-",
    reserveAddress: raw.reserve_address ?? "-",
    denomA: raw.denom_a ?? "-",
    ibcDenomA: raw.ibc_denom_a ?? "-",
    portA: raw.port_a ?? "-",
    channelA: raw.channel_a ?? "-",
    denomB: raw.denom_b ?? "-",
    ibcDenomB: raw.ibc_denom_b ?? "-",
    portB: raw.port_b ?? "-",
    channelB: raw.channel_b ?? "-",
    fee: raw.fee ?? "0",
    limit: raw.limit ?? "0",
    oracleRequestId: raw.oracle_request_id ?? "0",
    status: raw.status ?? "-",
    metadata: raw.metadata ?? null,
  };
}

function normalizeCoins(coins: BexCoinsResponse["coins"]): BexCoin[] {
  return (coins ?? [])
    .map((coin) => ({ denom: coin.denom ?? "", amount: coin.amount ?? "0" }))
    .filter((coin) => coin.denom.length > 0);
}

async function safeLcdGet<T>(path: string, apiClients: QueryClient = defaultClients): Promise<T | null> {

  return await apiClients.lcdGet<T>(path);
}

export async function isBexAvailable(apiClients: QueryClient = defaultClients): Promise<boolean> {

  const response = await safeLcdGet<BexExchangesResponse>("/guru/bex/v1/exchanges", apiClients);
  return response !== null;
}

export async function listBexExchanges(apiClients: QueryClient = defaultClients): Promise<BexExchange[]> {

  const response = await safeLcdGet<BexExchangesResponse>("/guru/bex/v1/exchanges", apiClients);
  if (!response?.exchanges) {
    return [];
  }
  return response.exchanges.map(normalizeExchange);
}

export async function getBexExchangeById(id: string, apiClients: QueryClient = defaultClients): Promise<BexExchange | null> {
  const exchanges = await listBexExchanges(apiClients);
  return exchanges.find((exchange) => exchange.id === id) ?? null;
}

export async function getBexExchangeFees(exchangeId: string, apiClients: QueryClient = defaultClients): Promise<BexExchangeFees> {
  if (!/^[0-9]+$/.test(exchangeId)) {
    return {
      collected: [],
      locked: [],
      available: [],
      hasCollectedError: true,
      hasLockedError: true,
      hasAvailableError: true,
    };
  }

  const query = `exchange_id=${encodeURIComponent(exchangeId)}`;
  const [collected, locked, available] = await Promise.allSettled([
    apiClients.lcdGet<BexCoinsResponse>(`/guru/bex/v1/collected_fees?${query}`),
    apiClients.lcdGet<BexCoinsResponse>(`/guru/bex/v1/locked_fees?${query}`),
    apiClients.lcdGet<BexCoinsResponse>(`/guru/bex/v1/available_fees?${query}`),
  ]);

  const data = {
    collected: collected.status === "fulfilled" ? normalizeCoins(collected.value.coins) : [],
    locked: locked.status === "fulfilled" ? normalizeCoins(locked.value.coins) : [],
    available: available.status === "fulfilled" ? normalizeCoins(available.value.coins) : [],
    hasCollectedError: collected.status !== "fulfilled",
    hasLockedError: locked.status !== "fulfilled",
    hasAvailableError: available.status !== "fulfilled",
  };
  const failures = [collected, locked, available].flatMap(r => r.status === "rejected" ? [r.reason] : []);
  if (failures.length === 3) throw new QueryError(combinedError(failures));
  if (failures.length) throw new PartialQueryError(data, combinedError(failures));
  return data;
}
