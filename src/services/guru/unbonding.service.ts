
import { serviceText } from '@/i18n/service-message';
import { addDecimal, type Coin } from "@/lib/cosmos-amount";
import { schemaError } from "@/lib/query-result";
import { apiClients, type QueryClient } from "@/services/clients";
export type UnbondingEntry = Coin & { validator: string; completionTime: string | null; creationHeight: string | null; queryHeight: string | null };
export type UnbondingSnapshot = { entries: UnbondingEntry[]; total: Coin; queryHeight: string | null };
type UnbondingResponse = { unbonding_responses?: Row[]; unbond?: Row; pagination?: { next_key?: string | null } };
type Row = { validator_address?: string; entries?: { balance?: string; completion_time?: string; creation_height?: string }[] };
export async function getUnbonding(address: string, denom: string, client: QueryClient = apiClients, validator?: string): Promise<UnbondingSnapshot> {
  const entries: UnbondingEntry[] = [];
  let cursor: string | null = null;
  let height: string | null = null;
  let consistent = true;
  let firstPage = true;
  let total = "0";
  const seen = new Set<string>();
  do {
    const path: string = `/cosmos/staking/v1beta1/delegators/${encodeURIComponent(address)}/unbonding_delegations${validator ? `/${encodeURIComponent(validator)}` : `?pagination.limit=100${cursor ? `&pagination.key=${encodeURIComponent(cursor)}` : ""}`}`;
    const response: { data: UnbondingResponse; blockHeight: string | null } = await client.lcdGetObserved<UnbondingResponse>(path, height ?? undefined);
    if (firstPage) { height = response.blockHeight; firstPage = false; }
    if (!response.blockHeight || response.blockHeight !== height) consistent = false;
    const rows = validator ? [response.data.unbond ?? schemaError()] : response.data.unbonding_responses ?? schemaError();
    for (const row of rows) for (const entry of row.entries ?? schemaError()) {
      if (!entry.balance || !/^\d+$/.test(entry.balance)) schemaError(serviceText("invalid_unbonding_balance"));
      total = addDecimal(total, entry.balance);
      entries.push({ amount: entry.balance, denom, validator: row.validator_address ?? validator ?? serviceText("unknown"), completionTime: entry.completion_time ?? null, creationHeight: entry.creation_height ?? null, queryHeight: response.blockHeight });
    }
    cursor = response.data.pagination?.next_key ?? null;
    if (cursor && seen.has(cursor)) schemaError(serviceText("unbonding_page_repeated"));
    if (cursor) seen.add(cursor);
  } while (cursor);
  return { entries, total: { amount: total, denom }, queryHeight: consistent ? height : null };
}
