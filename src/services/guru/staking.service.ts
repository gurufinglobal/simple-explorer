import { boundedRows, collectPages } from '../query-budget';

import { cursorParam, pageRows, queryPage, type LcdPagination } from '@/lib/query-page';
import { sumCoins, type Coin, type AmountMetadata } from "@/lib/cosmos-amount";
import { withAmountMetadata, getStakingParams } from "./amount-context.service";
import { getUnbonding, type UnbondingSnapshot } from "./unbonding.service";
import { PartialQueryError, QueryError, readFields, schemaError } from "@/lib/query-result";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";
import { readPublicEnv } from "@/lib/env";
import { bech32 } from "bech32";
import { getActiveChainConfig } from "@/lib/chain-selection";

export type ValidatorSummary = {
  bondDenom?: string;
  metadata?: AmountMetadata[];
  operatorAddress: string;
  moniker: string;
  votingPower: string;
  commission: string;
  jailed: boolean;
  status: string;
  details: string;
  website: string;
  identity: string;
  minSelfDelegation: string;
  unbondingHeight: string;
  unbondingTime: string;
};

export type ValidatorDetail = ValidatorSummary & {
  amountCoins?: Record<string, Coin[]>;
  unbondingDuration?: string;
  delegatorShares: string;
  totalDelegationAmount: string;
  selfDelegationAmount: string;
  outstandingRewardsAmount: string;
  commissionRewardsAmount: string;
  operatorAccountAddress: string;
};

export type DelegatorValidatorPosition = {
  amountCoins?: Record<string, Coin[]>;
  unbondingSnapshot?: UnbondingSnapshot;
  unbondingDuration?: string;
  metadata?: AmountMetadata[];
  delegationAmount: string;
  unbondingAmount: string;
  rewardAmount: string;
  isOperator: boolean;
};

type ValidatorsResponse = {
  pagination?: LcdPagination;
  validators?: Array<{
    operator_address?: string;
    description?: {
      moniker?: string;
      details?: string;
      website?: string;
      identity?: string;
    };
    status?: string;
    unbonding_height?: string;
    unbonding_time?: string;
    min_self_delegation?: string;
    tokens?: string;
    commission?: {
      commission_rates?: {
        rate?: string;
      };
    };
    jailed?: boolean;
  }>;
};

type ValidatorResponse = {
  validator?: {
    operator_address?: string;
    consensus_pubkey?: {
      "@type"?: string;
      key?: string;
    };
    jailed?: boolean;
    status?: string;
    tokens?: string;
    delegator_shares?: string;
    description?: {
      moniker?: string;
      identity?: string;
      website?: string;
      security_contact?: string;
      details?: string;
    };
    unbonding_height?: string;
    unbonding_time?: string;
    commission?: {
      commission_rates?: {
        rate?: string;
        max_rate?: string;
        max_change_rate?: string;
      };
      update_time?: string;
    };
    min_self_delegation?: string;
  };
};

type Pagination = {
  next_key?: string | null;
};

type ValidatorDelegationsPage = {
  delegation_responses?: Array<{
    balance?: {
      denom?: string;
      amount?: string;
    };
  }>;
  pagination?: Pagination;
};

type ValidatorOutstandingRewardsResponse = {
  rewards?: {
    rewards?: Array<{
      denom?: string;
      amount?: string;
    }>;
  };
};

type ValidatorCommissionResponse = {
  commission?: {
    commission?: Array<{
      denom?: string;
      amount?: string;
    }>;
  };
};

type DelegationResponse = {
  delegation_response?: {
    balance?: {
      denom?: string;
      amount?: string;
    };
  };
};

type DelegationRewardsResponse = {
  rewards?: Array<{
    denom?: string;
    amount?: string;
  }>;
};

function toValidatorSummary(validator: NonNullable<ValidatorsResponse["validators"]>[number]): ValidatorSummary {
  return {
    operatorAddress: validator.operator_address ?? "-",
    moniker: validator.description?.moniker ?? "unknown",
    votingPower: validator.tokens ?? "-",
    commission: validator.commission?.commission_rates?.rate ?? "0",
    jailed: validator.jailed ?? false,
    status: validator.status ?? "BOND_STATUS_UNSPECIFIED",
    details: validator.description?.details ?? "",
    website: validator.description?.website ?? "",
    identity: validator.description?.identity ?? "",
    minSelfDelegation: validator.min_self_delegation ?? "-",
    unbondingHeight: validator.unbonding_height ?? "0",
    unbondingTime: validator.unbonding_time ?? "",
  };
}

async function operatorToAccountAddress(operatorAddress: string): Promise<string | null> {
  try {
    const decoded = bech32.decode(operatorAddress);
    const chain = getActiveChainConfig();
    const fallbackPrefix = chain.bech32Prefix ?? readPublicEnv().NEXT_PUBLIC_BECH32_PREFIX ?? "guru";
    const accountPrefix = decoded.prefix.endsWith("valoper")
      ? decoded.prefix.slice(0, -"valoper".length)
      : fallbackPrefix;
    return bech32.encode(accountPrefix, decoded.words);
  } catch {
    return null;
  }
}

async function fetchValidatorDelegationTotal(operatorAddress: string, apiClients: QueryClient = defaultClients): Promise<Coin[]> {
  const coins = await collectPages(apiClients, async (client, cursor, remaining) => {
    const page = await client.lcdGet<ValidatorDelegationsPage>(`/cosmos/staking/v1beta1/validators/${encodeURIComponent(operatorAddress)}/delegations?pagination.limit=100${cursor ? `&pagination.key=${encodeURIComponent(cursor)}` : ""}`);
    const rows = boundedRows(page.delegation_responses ?? schemaError(), remaining).map(delegation => {
      const balance = delegation.balance ?? schemaError();
      if (!balance.amount || !balance.denom || !/^\d+$/.test(balance.amount)) schemaError();
      return { amount: balance.amount, denom: balance.denom };
    });
    return { rows, next: page.pagination?.next_key };
  });
  return sumCoins(coins);
}

export async function getTopValidators(limit = 20, apiClients: QueryClient = defaultClients): Promise<ValidatorSummary[]> {
  return pageRows(getValidatorsPage(limit, apiClients));
}

export async function getValidatorsPage(limit = 20, apiClients: QueryClient = defaultClients, cursor?: string | null) {
  return withAmountMetadata(apiClients, async metadata => {
    const response = await apiClients.lcdGet<ValidatorsResponse>(
      `/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=${limit}${cursorParam(cursor)}`,
    );
    const params = await getStakingParams(apiClients).catch(() => null);
    const rows = (response.validators ?? schemaError()).map(v => ({ ...toValidatorSummary(v), metadata, bondDenom: params?.bondDenom }));
    return queryPage<ValidatorSummary>(rows, response.pagination, limit);
  });
}

export async function getValidatorDetail(operatorAddress: string, apiClients: QueryClient = defaultClients): Promise<ValidatorDetail | null> {
  return withAmountMetadata(apiClients, async metadata => {
    const response = await apiClients.lcdGet<ValidatorResponse>(`/cosmos/staking/v1beta1/validators/${encodeURIComponent(operatorAddress)}`);
    const validator = response.validator;
    if (!validator) schemaError();
    const operatorAccountAddress = (await operatorToAccountAddress(operatorAddress)) ?? "-";
    const params = await getStakingParams(apiClients).catch(() => null);
    const amountCoins: Record<string, Coin[]> = {};
    const capture = (name: string, coins: Coin[]) => { const values = sumCoins(coins); amountCoins[name] = name === "totalDelegationAmount" ? values : coins; return values.map(c => c.amount).join(", ") || "0"; };
    const summary = { metadata, amountCoins, bondDenom: params?.bondDenom, unbondingDuration: params?.unbondingTime, ...toValidatorSummary(validator), operatorAccountAddress, delegatorShares: validator.delegator_shares ?? "-" };
    const defaults = { totalDelegationAmount: "-", selfDelegationAmount: "-", outstandingRewardsAmount: "-", commissionRewardsAmount: "-" };
    try {
      const fields = await readFields(defaults, {
        totalDelegationAmount: fetchValidatorDelegationTotal(operatorAddress, apiClients).then(coins => capture("totalDelegationAmount", coins)),
        selfDelegationAmount: operatorAccountAddress === "-" ? Promise.resolve("-") : apiClients.lcdGet<DelegationResponse>(`/cosmos/staking/v1beta1/validators/${encodeURIComponent(operatorAddress)}/delegations/${encodeURIComponent(operatorAccountAddress)}`).then(res => capture("selfDelegationAmount", [res.delegation_response?.balance as Coin ?? schemaError()])),
        outstandingRewardsAmount: apiClients.lcdGet<ValidatorOutstandingRewardsResponse>(`/cosmos/distribution/v1beta1/validators/${encodeURIComponent(operatorAddress)}/outstanding_rewards`).then(res => capture("outstandingRewardsAmount", (res.rewards?.rewards ?? schemaError()) as Coin[])),
        commissionRewardsAmount: apiClients.lcdGet<ValidatorCommissionResponse>(`/cosmos/distribution/v1beta1/validators/${encodeURIComponent(operatorAddress)}/commission`).then(res => capture("commissionRewardsAmount", (res.commission?.commission ?? schemaError()) as Coin[])),
      });
      return { ...summary, ...fields };
    } catch (error) {
      if (error instanceof PartialQueryError) throw new PartialQueryError({ ...summary, ...error.data }, error.info);
      if (error instanceof QueryError) throw new PartialQueryError({ ...summary, ...defaults }, error.info);
      throw error;
    }
  });
}

export async function getDelegatorValidatorPosition(
  delegatorAddress: string,
  operatorAddress: string, apiClients: QueryClient = defaultClients
): Promise<DelegatorValidatorPosition> {
  return withAmountMetadata(apiClients, async metadata => {

    const operatorAccountAddress = await operatorToAccountAddress(operatorAddress);
    const isOperator = Boolean(operatorAccountAddress && operatorAccountAddress === delegatorAddress);

    const amountCoins: Record<string, Coin[]> = {};
    const extra: Pick<DelegatorValidatorPosition, "amountCoins" | "metadata" | "unbondingSnapshot" | "unbondingDuration" | "isOperator"> = { amountCoins, metadata, isOperator };
    const capture = (name: string, coins: Coin[]) => { const values = sumCoins(coins); amountCoins[name] = coins; return values.map(c => c.amount).join(", ") || "0"; };
    const amounts = await readFields({ delegationAmount: "-", rewardAmount: "-", unbondingAmount: "-" }, {
      delegationAmount: apiClients.lcdGet<DelegationResponse>(`/cosmos/staking/v1beta1/validators/${encodeURIComponent(operatorAddress)}/delegations/${encodeURIComponent(delegatorAddress)}`).then(res => capture("delegationAmount", [res.delegation_response?.balance as Coin ?? schemaError()])),
      rewardAmount: apiClients.lcdGet<DelegationRewardsResponse>(`/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(delegatorAddress)}/rewards/${encodeURIComponent(operatorAddress)}`).then(res => capture("rewardAmount", (res.rewards ?? schemaError()) as Coin[])),
      unbondingAmount: getStakingParams(apiClients).then(async params => {
        extra.unbondingDuration = params.unbondingTime;
        extra.unbondingSnapshot = await getUnbonding(delegatorAddress, params.bondDenom, apiClients, operatorAddress);
        return capture("unbondingAmount", [extra.unbondingSnapshot.total]);
      }),
    }).catch(error => {
      if (error instanceof PartialQueryError) throw new PartialQueryError({ ...error.data, ...extra }, error.info);
      throw error;
    });
    return { ...amounts, ...extra };
  });
}
