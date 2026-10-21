import { PartialQueryError, collectQuery, queryError, schemaError } from "@/lib/query-result";
import { cursorParam, queryPage, type LcdPagination } from '@/lib/query-page';
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";
import type { TxDetail } from "./tx-details.service";
import { getLatestBlockHeight } from "./blocks.service";

type TxsResponse = {
  pagination?: LcdPagination;
  tx_responses?: Array<{
    txhash?: string;
    code?: number;
    height?: string;
    gas_used?: string;
    gas_wanted?: string;
    timestamp?: string;
  }>;
  txs?: Array<{
    body?: {
      memo?: string;
    };
  }>;
};

const MAX_SCAN_BLOCKS = 120;

function mapTxRows(response: TxsResponse): TxDetail[] {
  const txResponses = response.tx_responses ?? [];
  const txs = response.txs ?? [];
  return txResponses.map((item, index) => ({
    hash: item.txhash ?? "-",
    code: item.code ?? 0,
    codespace: "",
    height: item.height ?? "0",
    gasUsed: item.gas_used ?? "0",
    gasWanted: item.gas_wanted ?? "0",
    memo: txs[index]?.body?.memo ?? "",
    rawLog: "",
    feeAmount: [],
    feePayer: "",
    feeGranter: "",
    timeoutHeight: "0",
    messages: [],
    signerAddresses: [],
    participantAddresses: [],
    timestamp: item.timestamp,
  }));
}

export async function getRecentTransactions(limit = 10, apiClients: QueryClient = defaultClients): Promise<TxDetail[]> {

  const rows: TxDetail[] = [];
  try {
    const latestHeight = await getLatestBlockHeight(apiClients);
    if (latestHeight <= 0) {
      return [];
    }

    for (
      let height = latestHeight, scanned = 0;
      height > 0 && scanned < MAX_SCAN_BLOCKS && rows.length < limit;
      height--, scanned++
    ) {
      const query = encodeURIComponent(`tx.height=${height}`);
      const response = await apiClients.lcdGet<TxsResponse>(
        `/cosmos/tx/v1beta1/txs?query=${query}&pagination.limit=${limit - rows.length}&order_by=ORDER_BY_DESC`,
      );
      const mapped = mapTxRows(response);
      if (mapped.length > 0) {
        rows.push(...mapped);
      }
    }

    return rows.slice(0, limit);
  } catch (error) {
    if (rows.length) throw new PartialQueryError(rows, queryError(error));
    throw error;
  }
}

export async function getTransactionsByAddress(address: string, limit = 30, apiClients: QueryClient = defaultClients): Promise<TxDetail[]> {

  const merge = (rows: TxDetail[]) => Array.from(new Map(rows.map(tx => [tx.hash, tx])).values()).sort(compareAddressTransactions).slice(0, limit);
  const queries = [`message.sender='${address}'`, `transfer.recipient='${address}'`];
  try {
    const rows = await collectQuery(queries.map(query => apiClients.lcdGet<TxsResponse>(
      `/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&pagination.limit=${limit}&order_by=ORDER_BY_DESC`,
    ).then(mapTxRows)));
    return merge(rows.flat());
  } catch (error) {
    if (error instanceof PartialQueryError) throw new PartialQueryError(merge((error.data as TxDetail[][]).flat()), error.info);
    throw error;
  }
}

export type AddressTxDirection = 'sender' | 'recipient';
export function compareAddressTransactions(a: TxDetail, b: TxDetail): number {
  const ah = BigInt(a.height), bh = BigInt(b.height);
  return ah > bh ? -1 : ah < bh ? 1 : a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
}
export async function getAddressTransactionsPage(address: string, direction: AddressTxDirection, apiClients: QueryClient = defaultClients, cursor?: string | null, limit = 30) {
  const query = `${direction === 'sender' ? 'message.sender' : 'transfer.recipient'}='${address}'`;
  const response = await apiClients.lcdGet<TxsResponse>(
    `/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&pagination.limit=${limit}&order_by=ORDER_BY_DESC${cursorParam(cursor)}`,
  );
  if (!Array.isArray(response.tx_responses)) schemaError('주소 거래 목록이 올바르지 않습니다.');
  if (response.tx_responses.some(row => !row.txhash || !/^\d+$/.test(row.height ?? ''))) schemaError('거래 hash·높이가 올바르지 않습니다.');
  return queryPage(mapTxRows(response).sort(compareAddressTransactions), response.pagination, limit);
}

/** Merge two ordered streams without discarding either stream's remaining rows. */
export function mergeAddressTransactions(sender: TxDetail[], recipient: TxDetail[]): TxDetail[] {
  const rows: TxDetail[] = [], seen = new Set<string>();
  const streams = [sender.slice().sort(compareAddressTransactions), recipient.slice().sort(compareAddressTransactions)];
  let left = 0, right = 0;
  while (left < streams[0].length || right < streams[1].length) {
    const a = streams[0][left], b = streams[1][right];
    const row = !b || (a && compareAddressTransactions(a, b) <= 0) ? streams[0][left++] : streams[1][right++];
    const hash = row.hash.toUpperCase();
    if (!seen.has(hash)) { seen.add(hash); rows.push(row); }
  }
  return rows;
}
