import { PartialQueryError, collectQuery, queryError } from "@/lib/query-result";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";
import type { TxDetail } from "./tx-details.service";
import { getLatestBlockHeight } from "./blocks.service";

type TxsResponse = {
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

  const merge = (rows: TxDetail[]) => Array.from(new Map(rows.map(tx => [tx.hash, tx])).values()).slice(0, limit);
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
