import { boundedRows, collectPages } from '../query-budget';

import { serviceText } from '@/i18n/service-message';
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

export function getAddressBalances(address: string, client: QueryClient = defaultClients): Promise<AddressBalance[]> {
  return getBalances(address, client, "balances");
}
/** Spendable coins exclude locked vesting funds; query failures are never zero balances. */
export function getSpendableBalances(address: string, client: QueryClient = defaultClients): Promise<AddressBalance[]> {
  return getBalances(address, client, "spendable_balances");
}

async function getBalances(address: string, apiClients: QueryClient, kind: "balances" | "spendable_balances"): Promise<AddressBalance[]> {

  return collectPages(apiClients, async (client, cursor, remaining) => {
    const response = await client.lcdGet<LcdBalancesResponse & { pagination?: { next_key?: string | null } }>(
      `/cosmos/bank/v1beta1/${kind}/${encodeURIComponent(address)}?pagination.limit=100${cursor ? `&pagination.key=${encodeURIComponent(cursor)}` : ""}`,
    );
    const rows = boundedRows(response.balances ?? schemaError(), remaining).map(item => {
      if (!item.denom || !item.amount || !/^\d+$/.test(item.amount)) schemaError();
      return { denom: item.denom, amount: item.amount };
    });
    return { rows, next: response.pagination?.next_key };
  });
}

export async function getAddressAccountInfo(address: string, apiClients: QueryClient = defaultClients): Promise<AddressAccountInfo> {

  const response = await apiClients.lcdGet<LcdAccountResponse>(
    `/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`,
  );
  const accountNumber = readDeepStringField(response.account, "account_number");
  const sequence = readDeepStringField(response.account, "sequence");
  if (accountNumber === null || sequence === null) schemaError(serviceText("could_not_verify_account_number_or_sequence"));
  return {
    accountNumber,
    sequence,
  };
}
