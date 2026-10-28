import { withReadDeadline } from '../query-budget';

import { serviceText } from '@/i18n/service-message';
import { PartialQueryError, collectQuery, queryError, schemaError } from "@/lib/query-result";
import { type QueryPage, type LcdPagination } from '@/lib/query-page';
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";
import type { TxDetail } from "./tx-details.service";
import { getLatestBlockHeight } from "./blocks.service";

type TxsResponse = {
  pagination?: LcdPagination | null;
  total?: string;
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

const MAX_SCAN_BLOCKS = 30;

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

  return withReadDeadline(apiClients, async apiClients => {
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
  });
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
export async function getAddressTransactionsPage(address: string, direction: AddressTxDirection, apiClients: QueryClient = defaultClients, cursor?: string | null, limit = 30): Promise<QueryPage<TxDetail>> {
  // GetTxsEvent uses 1-based page/limit and top-level total (SDK >= 0.47).
  // These page numbers are internal cursors, not LCD pagination.next_key values.
  const page = cursor ?? '1';
  if (!/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(limit) || limit < 1) schemaError(serviceText("invalid_transaction_page_request"));
  const query = `${direction === 'sender' ? 'message.sender' : 'transfer.recipient'}='${address}'`;
  const response = await apiClients.lcdGet<TxsResponse>(
    `/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}&order_by=ORDER_BY_DESC`,
  );
  if (!Array.isArray(response.tx_responses)) schemaError(serviceText("invalid_address_transaction_list"));
  if (response.tx_responses.some(row => !row.txhash || !/^\d+$/.test(row.height ?? ''))) schemaError(serviceText("invalid_transaction_hash_or_height"));
  const rows = mapTxRows(response).sort(compareAddressTransactions);
  const total = typeof response.total === 'string' && /^\d+$/.test(response.total) ? response.total : null;
  const end = (BigInt(page) - BigInt(1)) * BigInt(limit) + BigInt(rows.length);
  // Missing/contradictory totals or ignored limits cannot establish progress.
  // Keep the rows visible but do not claim completion or guess another protocol.
  const unsupported = total === null || BigInt(total) < end || rows.length > limit
    || (BigInt(total) > end && rows.length < limit);
  return {
    rows, total, totalVerified: false,
    nextCursor: !unsupported && BigInt(total!) > end ? String(BigInt(page) + BigInt(1)) : null,
    ...(unsupported ? { stopReason: serviceText("stopped_loading_more_because_the_transaction_pagination_contract_could_not") } : {}),
  };
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

/** Live lists bound each height to one SDK page and disclose incomplete totals. */
export async function getTransactionsAtHeight(height: number, client: QueryClient): Promise<{ rows: TxDetail[]; limited: boolean }> {
  const response = await client.lcdGet<TxsResponse>(`/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(`tx.height=${height}`)}&page=1&limit=150&order_by=ORDER_BY_DESC`);
  const rows = mapTxRows(response);
  if (rows.some(row => row.height !== String(height) || !row.hash || row.hash === '-')) schemaError(serviceText("response_differs_from_the_requested_transaction_height"));
  const total = response.total;
  return { rows: rows.slice(0, 150), limited: typeof total !== 'string' || !/^\d+$/.test(total) || BigInt(total) !== BigInt(rows.length) || rows.length > 150 };
}
