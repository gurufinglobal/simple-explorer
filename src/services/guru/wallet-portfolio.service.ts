import { boundedRows, collectPages } from '../query-budget';

import { serviceText } from '@/i18n/service-message';
import { readFields, schemaError } from "@/lib/query-result";
import { formatCoins, sumCoins, type Coin, type AmountMetadata } from "@/lib/cosmos-amount";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";
import { getAddressBalances } from "./address-profile.service";
import { withAmountMetadata, getStakingParams } from "./amount-context.service";
import { getUnbonding, type UnbondingSnapshot } from "./unbonding.service";

export type WalletPortfolioSnapshot = {
  balance: string; staking: string; reward: string; unbonding: string;
  details?: { balance?: Coin[]; staking?: Coin[]; reward?: Coin[]; unbonding?: UnbondingSnapshot; unbondingTime?: string; metadata: AmountMetadata[] };
};
async function delegations(address: string, client: QueryClient): Promise<Coin[]> {
  const coins = await collectPages(client, async (bounded, cursor, remaining) => {
    const page = await bounded.lcdGet<{ delegation_responses?: { balance?: Coin }[]; pagination?: { next_key?: string | null } }>(`/cosmos/staking/v1beta1/delegations/${encodeURIComponent(address)}?pagination.limit=100${cursor ? `&pagination.key=${encodeURIComponent(cursor)}` : ""}`);
    return { rows: boundedRows(page.delegation_responses ?? schemaError(), remaining).map(row => row.balance ?? schemaError()), next: page.pagination?.next_key };
  });
  return sumCoins(coins);
}
export async function getWalletPortfolio(address: string, client: QueryClient = defaultClients): Promise<WalletPortfolioSnapshot> {
  const balance = getAddressBalances(address, client);
  // Start with the address screen bank read so their in-flight pages are shared.
  void balance.catch(() => undefined);
  return withAmountMetadata(client, async metadata => {
    const details: NonNullable<WalletPortfolioSnapshot["details"]> = { metadata };
    const params = getStakingParams(client);
    // Attach all consumers immediately, including rejected params, to retain partial fields.
    const format = (coins: Coin[], zeroDenom?: string) => coins.length ? formatCoins(coins, metadata) : zeroDenom ? formatCoins([{ amount: "0", denom: zeroDenom }], metadata) : serviceText("no_holdings");
    return readFields<WalletPortfolioSnapshot>({ balance: "—", staking: "—", reward: "—", unbonding: "—", details }, {
      balance: balance.then(coins => { details.balance = coins; return format(coins, client.chain.nativeDenom); }),
      staking: delegations(address, client).then(coins => { details.staking = coins; return format(coins, client.chain.bondDenom); }),
      reward: client.lcdGet<{ total?: Coin[] }>(`/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(address)}/rewards`).then(res => { const coins = sumCoins(res.total ?? schemaError()); details.reward = res.total; return format(coins, client.chain.bondDenom); }),
      unbonding: params.then(async p => { details.unbondingTime = p.unbondingTime; const result = await getUnbonding(address, p.bondDenom, client); details.unbonding = result; return format([result.total]); }),
    });
  });
}
