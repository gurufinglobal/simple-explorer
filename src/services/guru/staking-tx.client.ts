"use client";
import { serviceText, ServiceError } from '@/i18n/service-message';

import { bech32 } from "bech32";
import { z } from "zod";
import { MsgDelegate, MsgUndelegate } from "cosmjs-types/cosmos/staking/v1beta1/tx";
import { MsgWithdrawDelegatorReward, MsgWithdrawValidatorCommission } from "cosmjs-types/cosmos/distribution/v1beta1/tx";
import { assertBaseAmount, displayToBase, type Coin } from "@/lib/cosmos-amount";
import type { ChainConfig } from "@/lib/env";
import { prepareTransaction } from "@/services/transactions/prepare";
import type { StakingAction } from "@/services/transactions/transaction";
import type { SigningInput } from "@/services/wallet/signing-context";
import { getDenomsMetadata } from "./token-metadata.service";
import { getStakingParams } from "./amount-context.service";
import { getAddressAccountInfo, getSpendableBalances } from "./address-profile.service";

export const stakingMessages = {
  delegate: { typeUrl: "/cosmos.staking.v1beta1.MsgDelegate", label: serviceText("delegate"), module: "staking" },
  undelegate: { typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate", label: serviceText("undelegate"), module: "staking" },
  reward: { typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward", label: serviceText("claim_delegation_rewards"), module: "distribution" },
  commission: { typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission", label: serviceText("claim_operator_commission"), module: "distribution" },
} as const;
export type StakingTxInput = SigningInput & { validatorAddress: string } & (
  { action: "delegate" | "undelegate"; amount: string; denom: string; displayAmount?: string }
  | { action: "reward" | "commission" }
);
export function stakingBlockReason(chain: ChainConfig, action: StakingAction, wallet: SigningInput["walletType"] | null): string | null {
  const definition = stakingMessages[action];
  if (!definition || chain.features?.[definition.module] !== true || chain.features?.staking !== true) return serviceText("staking_distribution_module_support_for_this_action_is_unverified");
  const capability = chain.stakingCapabilities?.[action];
  if (!capability || capability.typeUrl !== definition.typeUrl) return serviceText("no_verified_message_or_fee_support_for_this_action_sending");
  if (!capability.signing.some(s => s.wallet === wallet && chain.signing?.some(c => c.wallet === wallet && c.method === s.method))) return serviceText("wallet_signing_for_this_message_is_unverified");
  return null;
}
const integerCoin = z.object({ denom: z.string().min(1), amount: z.string().regex(/^\d+$/) });
const rewardCoins = z.array(z.object({ denom: z.string().min(1), amount: z.string().regex(/^\d+(\.\d+)?$/) }));

export async function prepareStakingTx(input: StakingTxInput, assertInputCurrent: () => void = () => {}) {
  const params = { ...input };
  const hasAmount = params.action === "delegate" || params.action === "undelegate";
  if (hasAmount) assertBaseAmount(params.amount);
  return prepareTransaction(params, async ({ chain, query, sender, assertCurrent }) => {
    const reason = stakingBlockReason(chain, params.action, params.walletType);
    if (reason) throw new Error(reason);
    const capability = chain.stakingCapabilities![params.action]!;
    const validator = params.validatorAddress.trim();
    let operator: string;
    try {
      const decoded = bech32.decode(validator);
      if (decoded.prefix !== `${chain.bech32Prefix}valoper` || bech32.fromWords(decoded.words).length !== 20) throw new Error();
      operator = bech32.encode(chain.bech32Prefix!, decoded.words);
    } catch { throw new ServiceError("check_the_validator_address_checksum_length_and_chain_prefix"); }
    const validatorPath = `/cosmos/staking/v1beta1/validators/${encodeURIComponent(validator)}`;
    let observedRewards: Coin[] | undefined;
    const readPosition = async () => {
      const [staking, response] = await Promise.all([
        getStakingParams(query),
        query.lcdGet<unknown>(validatorPath),
        getAddressAccountInfo(sender, query),
      ]);
      assertCurrent();
      if (staking.bondDenom !== chain.bondDenom || (hasAmount && params.denom !== staking.bondDenom)) throw new ServiceError("verified_bond_denom_differs_from_current_staking_parameters");
      const current = z.object({ validator: z.object({ operator_address: z.string(), jailed: z.boolean(), status: z.enum(["BOND_STATUS_BONDED", "BOND_STATUS_UNBONDED", "BOND_STATUS_UNBONDING"]) }) }).parse(response).validator;
      if (current.operator_address !== validator) throw new ServiceError("queried_validator_differs_from_the_transaction_target");
      if (params.action === "delegate" && current.jailed) throw new ServiceError("cannot_delegate_to_a_jailed_validator");
      if (params.action === "commission" && sender !== operator) throw new ServiceError("operator_account_permissions_do_not_match_commission_withdrawal_is_blocked");
      if (params.action === "undelegate" || params.action === "reward") {
        const position = z.object({ delegation_response: z.object({
          delegation: z.object({ delegator_address: z.string(), validator_address: z.string() }), balance: integerCoin,
        }) }).parse(await query.lcdGet(`${validatorPath}/delegations/${encodeURIComponent(sender)}`)).delegation_response;
        assertCurrent();
        if (position.delegation.delegator_address !== sender || position.delegation.validator_address !== validator || position.balance.denom !== staking.bondDenom) throw new ServiceError("delegation_position_account_validator_or_denom_mismatch");
        if (params.action === "undelegate" && BigInt(position.balance.amount) < BigInt(params.amount)) throw new ServiceError("undelegation_exceeds_your_delegated_balance_at_this_validator");
      }
      if (params.action === "reward") {
        const response = z.object({ rewards: rewardCoins }).parse(await query.lcdGet(`/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(sender)}/rewards/${encodeURIComponent(validator)}`));
        observedRewards = response.rewards;
      } else if (params.action === "commission") {
        const response = z.object({ commission: z.object({ commission: rewardCoins }) }).parse(await query.lcdGet(`/cosmos/distribution/v1beta1/validators/${encodeURIComponent(validator)}/commission`));
        observedRewards = response.commission.commission;
      }
      assertCurrent();
    };
    await readPosition();
    let displayAmount: string | undefined;
    let unit: string | undefined;
    if (hasAmount) {
      const metadata = (await getDenomsMetadata(query)).find(m => m.baseDenom === params.denom);
      assertCurrent();
      if (metadata?.decimals == null) throw new ServiceError("display_precision_unknown_cannot_verify_the_delegation_or_undelegation_amount");
      const padded = params.amount.padStart(metadata.decimals + 1, "0");
      displayAmount = params.displayAmount ?? (metadata.decimals ? `${padded.slice(0, -metadata.decimals)}.${padded.slice(-metadata.decimals)}` : params.amount);
      if (displayToBase(displayAmount, metadata.decimals) !== params.amount) throw new ServiceError("display_amount_differs_from_the_raw_transaction_amount");
      unit = metadata.symbol || metadata.displayDenom;
    }
    const amount = hasAmount ? { amount: params.amount, denom: params.denom } : undefined;
    const value = params.action === "delegate" ? MsgDelegate.fromPartial({ delegatorAddress: sender, validatorAddress: validator, amount })
      : params.action === "undelegate" ? MsgUndelegate.fromPartial({ delegatorAddress: sender, validatorAddress: validator, amount })
      : params.action === "reward" ? MsgWithdrawDelegatorReward.fromPartial({ delegatorAddress: sender, validatorAddress: validator })
      : MsgWithdrawValidatorCommission.fromPartial({ validatorAddress: validator });
    return {
      message: { typeUrl: stakingMessages[params.action].typeUrl, value }, policy: capability.fee, allowedSigning: capability.signing,
      context: Object.freeze({ action: params.action, validator }),
      display: { action: stakingMessages[params.action].label, recipient: validator, targetLabel: serviceText("full_validator_address"),
        ...(amount ? { ...amount, displayAmount, unit } : { observedRewards: Object.freeze(observedRewards!.map(c => Object.freeze({ ...c }))) }) },
      check: async (fee: import("@cosmjs/amino").StdFee) => {
        await readPosition();
        const balances = await getSpendableBalances(sender, query);
        assertCurrent();
        const required = new Map<string, bigint>();
        if (params.action === "delegate") required.set(params.denom, BigInt(params.amount));
        for (const coin of fee.amount) required.set(coin.denom, (required.get(coin.denom) ?? BigInt(0)) + BigInt(coin.amount));
        for (const [denom, amount] of required) {
          const available = balances.filter(c => c.denom === denom).reduce((sum, c) => sum + BigInt(c.amount), BigInt(0));
          if (available < amount) throw new ServiceError("insufficient_spendable_balance_current_balance_must_cover_fees_expected_rewards", { value0: String(denom), value1: String(params.action === "delegate" ? serviceText("and_delegation_amount") : "") });
        }
      },
    };
  }, assertInputCurrent);
}
