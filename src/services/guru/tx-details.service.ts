import { apiClients } from "@/services/clients";

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

type LcdTxResponse = {
  tx_response?: {
    height?: string;
    txhash?: string;
    codespace?: string;
    code?: number;
    gas_used?: string;
    gas_wanted?: string;
    timestamp?: string;
    raw_log?: string;
  };
  tx?: {
    body?: {
      memo?: string;
      timeout_height?: string;
      messages?: Array<{
        "@type"?: string;
        type_url?: string;
        [key: string]: unknown;
      }>;
    };
    auth_info?: {
      signer_infos?: Array<{
        public_key?: {
          key?: string;
        };
      }>;
      fee?: {
        amount?: Array<{
          denom?: string;
          amount?: string;
        }>;
        gas_limit?: string;
        payer?: string;
        granter?: string;
      };
    };
  };
};

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

export async function getTxDetail(hash: string): Promise<TxDetail | null> {
  if (process.env.NODE_ENV === "test") {
    return {
      hash,
      code: 0,
      codespace: "",
      height: "0",
      gasUsed: "0",
      gasWanted: "0",
      memo: "",
      rawLog: "",
      feeAmount: [],
      feePayer: "",
      feeGranter: "",
      timeoutHeight: "0",
      messages: [],
      signerAddresses: [],
      participantAddresses: [],
    };
  }

  try {
    const response = await apiClients.lcdGet<LcdTxResponse>(
      `/cosmos/tx/v1beta1/txs/${encodeURIComponent(hash)}`,
    );
    const txResponse = response.tx_response;
    if (!txResponse) {
      return null;
    }
    const messagesRaw = response.tx?.body?.messages ?? [];
    const messages = messagesRaw.map((message) => {
      const typeUrl = message["@type"] ?? message.type_url ?? "";
      return {
        typeUrl,
        shortType: shortType(typeUrl),
      };
    });

    const participants = new Set<string>();
    for (const msg of messagesRaw) {
      collectAddressesFromMessageValue(msg, participants);
    }

    const feeAmount = (response.tx?.auth_info?.fee?.amount ?? []).map((coin) => ({
      denom: coin.denom ?? "-",
      amount: coin.amount ?? "0",
    }));

    return {
      hash: txResponse.txhash ?? hash,
      code: txResponse.code ?? 0,
      codespace: txResponse.codespace ?? "",
      height: txResponse.height ?? "0",
      gasUsed: txResponse.gas_used ?? "0",
      gasWanted: txResponse.gas_wanted ?? "0",
      memo: response.tx?.body?.memo ?? "",
      rawLog: txResponse.raw_log ?? "",
      feeAmount,
      feePayer: response.tx?.auth_info?.fee?.payer ?? "",
      feeGranter: response.tx?.auth_info?.fee?.granter ?? "",
      timeoutHeight: response.tx?.body?.timeout_height ?? "0",
      messages,
      signerAddresses: [],
      participantAddresses: Array.from(participants),
      timestamp: txResponse.timestamp,
    };
  } catch {
    return null;
  }
}
