import { PartialQueryError, QueryError, readFields, schemaError } from "@/lib/query-result";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";
import { readPublicEnv } from "@/lib/env";
import { bech32 } from "bech32";
import { getActiveChainConfig } from "@/lib/chain-selection";

export type ValidatorSummary = {
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
  delegatorShares: string;
  totalDelegationAmount: string;
  selfDelegationAmount: string;
  outstandingRewardsAmount: string;
  commissionRewardsAmount: string;
  operatorAccountAddress: string;
};

export type DelegatorValidatorPosition = {
  delegationAmount: string;
  unbondingAmount: string;
  rewardAmount: string;
  isOperator: boolean;
};

type ValidatorsResponse = {
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

type UnbondingByValidatorResponse = {
  unbond?: {
    entries?: Array<{
      balance?: string;
    }>;
  };
};

const PRIMARY_DENOM = "agxn";

function toValidatorSummary(validator: NonNullable<ValidatorsResponse["validators"]>[number]): ValidatorSummary {
  return {
    operatorAddress: validator.operator_address ?? "-",
    moniker: validator.description?.moniker ?? "unknown",
    votingPower: validator.tokens ?? "0",
    commission: validator.commission?.commission_rates?.rate ?? "0",
    jailed: validator.jailed ?? false,
    status: validator.status ?? "BOND_STATUS_UNSPECIFIED",
    details: validator.description?.details ?? "",
    website: validator.description?.website ?? "",
    identity: validator.description?.identity ?? "",
    minSelfDelegation: validator.min_self_delegation ?? "0",
    unbondingHeight: validator.unbonding_height ?? "0",
    unbondingTime: validator.unbonding_time ?? "",
  };
}

function extractPrimaryDenomAmount(
  coins: Array<{
    denom?: string;
    amount?: string;
  }>,
): string {
  const target = coins.find((coin) => coin.denom === PRIMARY_DENOM)?.amount;
  return target && /^-?[0-9]+(\.[0-9]+)?$/.test(target) ? target : "0";
}

function sumUnbonding(entries: Array<{ balance?: string }> | undefined): string {
  let total = BigInt(0);
  for (const entry of entries ?? []) {
    const amount = entry.balance;
    if (amount && /^[0-9]+$/.test(amount)) {
      total += BigInt(amount);
    }
  }
  return total.toString();
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

async function fetchValidatorDelegationTotal(operatorAddress: string, apiClients: QueryClient = defaultClients): Promise<string> {
  let nextKey: string | null | undefined;
  let total = BigInt(0);

  do {
    const path =
      nextKey === undefined || nextKey === null
        ? `/cosmos/staking/v1beta1/validators/${encodeURIComponent(operatorAddress)}/delegations?pagination.limit=100`
        : `/cosmos/staking/v1beta1/validators/${encodeURIComponent(operatorAddress)}/delegations?pagination.limit=100&pagination.key=${encodeURIComponent(nextKey)}`;
    const page = await apiClients.lcdGet<ValidatorDelegationsPage>(path);
    for (const delegation of page.delegation_responses ?? schemaError()) {
      const amount = delegation.balance?.amount;
      const denom = delegation.balance?.denom;
      if (amount && denom === PRIMARY_DENOM && /^[0-9]+$/.test(amount)) {
        total += BigInt(amount);
      }
    }
    nextKey = page.pagination?.next_key ?? null;
  } while (nextKey);

  return total.toString();
}

export async function getTopValidators(limit = 20, apiClients: QueryClient = defaultClients): Promise<ValidatorSummary[]> {

  const response = await apiClients.lcdGet<ValidatorsResponse>(
    `/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=${limit}`,
  );
  return (response.validators ?? []).map(toValidatorSummary);
}

export async function getValidatorDetail(operatorAddress: string, apiClients: QueryClient = defaultClients): Promise<ValidatorDetail | null> {
  const response = await apiClients.lcdGet<ValidatorResponse>(`/cosmos/staking/v1beta1/validators/${encodeURIComponent(operatorAddress)}`);
  const validator = response.validator;
  if (!validator) schemaError();
  const operatorAccountAddress = (await operatorToAccountAddress(operatorAddress)) ?? "-";
  const summary = { ...toValidatorSummary(validator), operatorAccountAddress, delegatorShares: validator.delegator_shares ?? "-" };
  const defaults = { totalDelegationAmount: "-", selfDelegationAmount: "-", outstandingRewardsAmount: "-", commissionRewardsAmount: "-" };
  try {
    const fields = await readFields(defaults, {
      totalDelegationAmount: fetchValidatorDelegationTotal(operatorAddress, apiClients),
      selfDelegationAmount: operatorAccountAddress === "-" ? Promise.resolve("-") : apiClients.lcdGet<DelegationResponse>(`/cosmos/staking/v1beta1/validators/${encodeURIComponent(operatorAddress)}/delegations/${encodeURIComponent(operatorAccountAddress)}`).then(res => res.delegation_response?.balance?.amount ?? schemaError()),
      outstandingRewardsAmount: apiClients.lcdGet<ValidatorOutstandingRewardsResponse>(`/cosmos/distribution/v1beta1/validators/${encodeURIComponent(operatorAddress)}/outstanding_rewards`).then(res => extractPrimaryDenomAmount(res.rewards?.rewards ?? schemaError())),
      commissionRewardsAmount: apiClients.lcdGet<ValidatorCommissionResponse>(`/cosmos/distribution/v1beta1/validators/${encodeURIComponent(operatorAddress)}/commission`).then(res => extractPrimaryDenomAmount(res.commission?.commission ?? schemaError())),
    });
    return { ...summary, ...fields };
  } catch (error) {
    if (error instanceof PartialQueryError) throw new PartialQueryError({ ...summary, ...error.data }, error.info);
    if (error instanceof QueryError) throw new PartialQueryError({ ...summary, ...defaults }, error.info);
    throw error;
  }
}

export async function getDelegatorValidatorPosition(
  delegatorAddress: string,
  operatorAddress: string, apiClients: QueryClient = defaultClients
): Promise<DelegatorValidatorPosition> {

  const operatorAccountAddress = await operatorToAccountAddress(operatorAddress);
  const isOperator = Boolean(operatorAccountAddress && operatorAccountAddress === delegatorAddress);

  const amounts = await readFields({ delegationAmount: "-", rewardAmount: "-", unbondingAmount: "-" }, {
    delegationAmount: apiClients.lcdGet<DelegationResponse>(`/cosmos/staking/v1beta1/validators/${encodeURIComponent(operatorAddress)}/delegations/${encodeURIComponent(delegatorAddress)}`).then(res => res.delegation_response?.balance?.amount ?? schemaError()),
    rewardAmount: apiClients.lcdGet<DelegationRewardsResponse>(`/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(delegatorAddress)}/rewards/${encodeURIComponent(operatorAddress)}`).then(res => extractPrimaryDenomAmount(res.rewards ?? schemaError())),
    unbondingAmount: apiClients.lcdGet<UnbondingByValidatorResponse>(`/cosmos/staking/v1beta1/delegators/${encodeURIComponent(delegatorAddress)}/unbonding_delegations/${encodeURIComponent(operatorAddress)}`).then(res => sumUnbonding(res.unbond?.entries ?? schemaError())),
  }).catch(error => {
    if (error instanceof PartialQueryError) throw new PartialQueryError({ ...error.data, isOperator }, error.info);
    throw error;
  });
  return { ...amounts, isOperator };
}
