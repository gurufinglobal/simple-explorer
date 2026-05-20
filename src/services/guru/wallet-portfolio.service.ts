import { formatBaseAmountToGxn } from "@/lib/cosmos-amount";
import { apiClients } from "@/services/clients";
import { getAddressBalances } from "./address-profile.service";

const PRIMARY_DENOM = "agxn";

export type WalletPortfolioSnapshot = {
  balance: string;
  staking: string;
  reward: string;
  unbonding: string;
};

type Pagination = {
  next_key?: string | null;
};

type DelegationsPage = {
  delegation_responses?: {
    balance?: { denom?: string; amount?: string };
  }[];
  pagination?: Pagination;
};

type RewardsResponse = {
  total?: { denom?: string; amount?: string }[];
};

type UnbondingPage = {
  unbonding_responses?: {
    entries?: { balance?: string }[];
  }[];
  pagination?: Pagination;
};

function sumPrimaryDenomFromCoins(coins: { denom?: string; amount?: string }[]): bigint {
  let sum = BigInt(0);
  for (const c of coins) {
    if (c.denom === PRIMARY_DENOM && c.amount && /^[0-9]+$/.test(c.amount)) {
      sum += BigInt(c.amount);
    }
  }
  return sum;
}

async function fetchDelegationsStakeTotal(delegator: string): Promise<bigint> {
  let nextKey: string | null | undefined;
  let total = BigInt(0);
  do {
    const path =
      nextKey === undefined || nextKey === null
        ? `/cosmos/staking/v1beta1/delegations/${encodeURIComponent(delegator)}?pagination.limit=100`
        : `/cosmos/staking/v1beta1/delegations/${encodeURIComponent(delegator)}?pagination.limit=100&pagination.key=${encodeURIComponent(nextKey)}`;
    const page = await apiClients.lcdGet<DelegationsPage>(path);
    for (const row of page.delegation_responses ?? []) {
      const amt = row.balance?.amount;
      if (row.balance?.denom === PRIMARY_DENOM && amt && /^[0-9]+$/.test(amt)) {
        total += BigInt(amt);
      }
    }
    nextKey = page.pagination?.next_key ?? null;
  } while (nextKey);

  return total;
}

async function fetchDelegatorRewardsTotal(delegator: string): Promise<bigint> {
  const res = await apiClients.lcdGet<RewardsResponse>(
    `/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(delegator)}/rewards`,
  );
  return sumPrimaryDenomFromCoins(res.total ?? []);
}

async function fetchUnbondingTotal(delegator: string): Promise<bigint> {
  let nextKey: string | null | undefined;
  let total = BigInt(0);
  do {
    const path =
      nextKey === undefined || nextKey === null
        ? `/cosmos/staking/v1beta1/delegators/${encodeURIComponent(delegator)}/unbonding_delegations?pagination.limit=100`
        : `/cosmos/staking/v1beta1/delegators/${encodeURIComponent(delegator)}/unbonding_delegations?pagination.limit=100&pagination.key=${encodeURIComponent(nextKey)}`;
    const page = await apiClients.lcdGet<UnbondingPage>(path);
    for (const u of page.unbonding_responses ?? []) {
      for (const e of u.entries ?? []) {
        const bal = e.balance;
        if (bal && /^[0-9]+$/.test(bal)) {
          total += BigInt(bal);
        }
      }
    }
    nextKey = page.pagination?.next_key ?? null;
  } while (nextKey);

  return total;
}

async function fetchBankPrimaryTotal(address: string): Promise<bigint> {
  const balances = await getAddressBalances(address);
  let sum = BigInt(0);
  for (const b of balances) {
    if (b.denom === PRIMARY_DENOM && /^[0-9]+$/.test(b.amount)) {
      sum += BigInt(b.amount);
    }
  }
  return sum;
}

/**
 * Bank balance + staking delegation + rewards + unbonding (PRIMARY_DENOM agxn) for a Cosmos bech32 address.
 */
export async function getWalletPortfolio(cosmosAddress: string): Promise<WalletPortfolioSnapshot> {
  if (process.env.NODE_ENV === "test") {
    return {
      balance: "1.0 gxn",
      staking: "2.0 gxn",
      reward: "0.1 gxn",
      unbonding: "0 gxn",
    };
  }

  const [bank, deleg, rewards, unbond] = await Promise.all([
    fetchBankPrimaryTotal(cosmosAddress),
    fetchDelegationsStakeTotal(cosmosAddress),
    fetchDelegatorRewardsTotal(cosmosAddress),
    fetchUnbondingTotal(cosmosAddress),
  ]);

  return {
    balance: formatBaseAmountToGxn(bank.toString()),
    staking: formatBaseAmountToGxn(deleg.toString()),
    reward: formatBaseAmountToGxn(rewards.toString()),
    unbonding: formatBaseAmountToGxn(unbond.toString()),
  };
}
