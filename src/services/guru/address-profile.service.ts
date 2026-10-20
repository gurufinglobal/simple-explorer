import { schemaError } from "@/lib/query-result";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";

export type AddressBalance = {
  denom: string;
  amount: string;
};

export type AddressAccountInfo = {
  accountNumber: string | null;
  sequence: string | null;
};

type LcdBalancesResponse = {
  balances?: Array<{
    denom?: string;
    amount?: string;
  }>;
};

type LcdAccountResponse = {
  account?: unknown;
};

function readDeepStringField(target: unknown, fieldName: string): string | null {
  if (!target || typeof target !== "object") {
    return null;
  }
  if (Array.isArray(target)) {
    for (const item of target) {
      const found = readDeepStringField(item, fieldName);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  const object = target as Record<string, unknown>;
  const direct = object[fieldName];
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }

  for (const value of Object.values(object)) {
    const found = readDeepStringField(value, fieldName);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

export async function getAddressBalances(address: string, apiClients: QueryClient = defaultClients): Promise<AddressBalance[]> {

  const response = await apiClients.lcdGet<LcdBalancesResponse>(
    `/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`,
  );
  const balances = response.balances ?? [];
  return balances.map((item) => ({
    denom: item.denom ?? "unknown",
    amount: item.amount ?? "0",
  }));
}

export async function getAddressAccountInfo(address: string, apiClients: QueryClient = defaultClients): Promise<AddressAccountInfo> {

  const response = await apiClients.lcdGet<LcdAccountResponse>(
    `/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`,
  );
  const accountNumber = readDeepStringField(response.account, "account_number");
  const sequence = readDeepStringField(response.account, "sequence");
  if (accountNumber === null || sequence === null) schemaError("계정 번호/sequence를 확인할 수 없습니다.");
  return {
    accountNumber,
    sequence,
  };
}
