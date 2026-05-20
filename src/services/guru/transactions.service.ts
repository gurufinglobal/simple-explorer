import { apiClients } from "@/services/clients";
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

export async function getRecentTransactions(limit = 10): Promise<TxDetail[]> {
  if (process.env.NODE_ENV === "test") {
    return [];
  }

  try {
    const latestHeight = await getLatestBlockHeight();
    if (latestHeight <= 0) {
      return [];
    }

    const rows: TxDetail[] = [];
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
  } catch {
    return [];
  }
}

export async function getTransactionsByAddress(address: string, limit = 30): Promise<TxDetail[]> {
  if (process.env.NODE_ENV === "test") {
    return [];
  }

  try {
    const senderQuery = encodeURIComponent(`message.sender='${address}'`);
    const senderResponse = await apiClients.lcdGet<TxsResponse>(
      `/cosmos/tx/v1beta1/txs?query=${senderQuery}&pagination.limit=${limit}&order_by=ORDER_BY_DESC`,
    );
    const senderRows = mapTxRows(senderResponse);

    const recipientQuery = encodeURIComponent(`transfer.recipient='${address}'`);
    const recipientResponse = await apiClients.lcdGet<TxsResponse>(
      `/cosmos/tx/v1beta1/txs?query=${recipientQuery}&pagination.limit=${limit}&order_by=ORDER_BY_DESC`,
    );
    const recipientRows = mapTxRows(recipientResponse);

    const merged = [...senderRows, ...recipientRows];
    const deduped = new Map<string, TxDetail>();
    for (const tx of merged) {
      if (!deduped.has(tx.hash)) {
        deduped.set(tx.hash, tx);
      }
    }

    return Array.from(deduped.values()).slice(0, limit);
  } catch {
    return [];
  }
}
