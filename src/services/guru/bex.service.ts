import { moduleDetail, moduleRows, rawText, requiredText, record } from "./module-contract";
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
  if (!record(raw)) throw new Error("Invalid exchange");
  return {
    id: requiredText(raw.id),
    adminAddress: rawText(raw.admin_address),
    reserveAddress: rawText(raw.reserve_address),
    denomA: rawText(raw.denom_a),
    ibcDenomA: rawText(raw.ibc_denom_a),
    portA: rawText(raw.port_a),
    channelA: rawText(raw.channel_a),
    denomB: rawText(raw.denom_b),
    ibcDenomB: rawText(raw.ibc_denom_b),
    portB: rawText(raw.port_b),
    channelB: rawText(raw.channel_b),
    fee: rawText(raw.fee),
    limit: rawText(raw.limit),
    oracleRequestId: rawText(raw.oracle_request_id),
    status: rawText(raw.status),
    metadata: raw.metadata ?? null,
  };
}

function normalizeCoins(coins: BexCoinsResponse["coins"]): BexCoin[] {
  return moduleRows(coins, coin => ({ denom: requiredText(coin.denom), amount: requiredText(coin.amount) }));
}

async function safeLcdGet<T>(path: string, apiClients: QueryClient = defaultClients): Promise<T | null> {

  return await apiClients.lcdGet<T>(path);
}

export async function listBexExchanges(apiClients: QueryClient = defaultClients): Promise<BexExchange[]> {

  const response = await safeLcdGet<BexExchangesResponse>("/guru/bex/v1/exchanges", apiClients);
  return moduleRows(response?.exchanges, normalizeExchange);
}

export async function getBexExchangeById(id: string, apiClients: QueryClient = defaultClients): Promise<BexExchange | null> {
  return moduleDetail(() => listBexExchanges(apiClients), exchange => exchange.id === id);
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
    apiClients.lcdGet<BexCoinsResponse>(`/guru/bex/v1/collected_fees?${query}`).then(response => normalizeCoins(response.coins)),
    apiClients.lcdGet<BexCoinsResponse>(`/guru/bex/v1/locked_fees?${query}`).then(response => normalizeCoins(response.coins)),
    apiClients.lcdGet<BexCoinsResponse>(`/guru/bex/v1/available_fees?${query}`).then(response => normalizeCoins(response.coins)),
  ]);

  const data = {
    collected: collected.status === "fulfilled" ? collected.value : collected.reason instanceof PartialQueryError ? collected.reason.data as BexCoin[] : [],
    locked: locked.status === "fulfilled" ? locked.value : locked.reason instanceof PartialQueryError ? locked.reason.data as BexCoin[] : [],
    available: available.status === "fulfilled" ? available.value : available.reason instanceof PartialQueryError ? available.reason.data as BexCoin[] : [],
    hasCollectedError: collected.status !== "fulfilled",
    hasLockedError: locked.status !== "fulfilled",
    hasAvailableError: available.status !== "fulfilled",
  };
  const failures = [collected, locked, available].flatMap(r => r.status === "rejected" ? [r.reason] : []);
  if (failures.length === 3 && !data.collected.length && !data.locked.length && !data.available.length) throw new QueryError(combinedError(failures));
  if (failures.length) throw new PartialQueryError(data, combinedError(failures));
  return data;
}
