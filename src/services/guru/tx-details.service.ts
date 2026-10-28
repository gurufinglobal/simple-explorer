import { schemaError } from "@/lib/query-result";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";

export type TxDetail = {
  hash: string;
  code: number;
  codespace: string;
  height: string;
  gasUsed: string;
  gasWanted: string;
  memo: string;
  rawLog: string;
  feeAmount: Array<{ denom: string; amount: string }>;
  feePayer: string;
  feeGranter: string;
  timeoutHeight: string;
  messages: Array<{ typeUrl: string; shortType: string }>;
  signerAddresses: string[];
  participantAddresses: string[];
  /** ISO-8601 from LCD `tx_response.timestamp` when available. */
  timestamp?: string;
};

/** Only the detail request retains the full LCD payload; list rows stay lightweight. */
export type TxInspection = Omit<TxDetail, "code"> & {
  code: number | null;
  raw: Record<string, unknown>;
  selectedTx: Record<string, unknown> | null;
  txSource: "top" | "nested" | "missing" | "invalid";
  messageBodies: unknown;
  events: unknown;
  logs: unknown;
};

export function txRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

function shortType(typeUrl: string): string {
  if (!typeUrl.trim()) {
    return "unknown";
  }
  const parts = typeUrl.split(".");
  return parts[parts.length - 1] ?? typeUrl;
}

function isLikelyAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) || /^[a-z]{3,}[0-9][0-9a-z]{20,}$/.test(value);
}

function collectAddressesFromMessageValue(value: unknown, out: Set<string>): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAddressesFromMessageValue(item, out);
    }
    return;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      if (key.endsWith("_address") || key === "address" || key === "sender" || key === "recipient") {
        out.add(entry);
      } else if (isLikelyAddress(entry)) {
        out.add(entry);
      }
      continue;
    }
    collectAddressesFromMessageValue(entry, out);
  }
}

export async function getTxDetail(hash: string, apiClients: QueryClient = defaultClients): Promise<TxInspection> {
  const payload = await apiClients.lcdGet<unknown>(
    `/cosmos/tx/v1beta1/txs/${encodeURIComponent(hash)}`,
  );
  const response = txRecord(payload);
  const txResponse = txRecord(response?.tx_response);
  if (!response || !txResponse) schemaError();

  // Top-level tx wins when provided. Null/absent falls back to tx_response.tx.
  // A malformed provided top-level tx is disclosed, never silently replaced.
  const top = response.tx !== undefined && response.tx !== null;
  const candidate = top ? response.tx : txResponse.tx;
  const selectedTx = txRecord(candidate);
  const txSource = selectedTx ? (top ? "top" : "nested")
    : candidate === undefined || candidate === null ? "missing" : "invalid";
  const body = txRecord(selectedTx?.body);
  const fee = txRecord(txRecord(selectedTx?.auth_info)?.fee);
  const messagesRaw = Array.isArray(body?.messages) ? body.messages : [];
  const participants = new Set<string>();
  const messages = messagesRaw.map((value) => {
    const message = txRecord(value);
    const typeUrl = text(message?.["@type"], text(message?.type_url));
    collectAddressesFromMessageValue(value, participants);
    return { typeUrl, shortType: shortType(typeUrl) };
  });
  const feeAmount = (Array.isArray(fee?.amount) ? fee.amount : []).map((value) => {
    const coin = txRecord(value);
    return { denom: text(coin?.denom, "—"), amount: text(coin?.amount, "—") };
  });
  return {
    hash: text(txResponse.txhash, hash),
    code: typeof txResponse.code === "number" && Number.isSafeInteger(txResponse.code) && txResponse.code >= 0 ? txResponse.code : null,
    codespace: text(txResponse.codespace),
    height: text(txResponse.height, "—"),
    gasUsed: text(txResponse.gas_used, "—"),
    gasWanted: text(txResponse.gas_wanted, "—"),
    memo: text(body?.memo),
    rawLog: text(txResponse.raw_log),
    feeAmount,
    feePayer: text(fee?.payer),
    feeGranter: text(fee?.granter),
    timeoutHeight: text(body?.timeout_height, "—"),
    messages,
    signerAddresses: [],
    participantAddresses: Array.from(participants),
    timestamp: text(txResponse.timestamp) || undefined,
    raw: response,
    selectedTx,
    txSource,
    messageBodies: body?.messages,
    events: txResponse.events,
    logs: txResponse.logs,
  };
}
