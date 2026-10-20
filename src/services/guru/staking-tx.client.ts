"use client";
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
  delegate: { typeUrl: "/cosmos.staking.v1beta1.MsgDelegate", label: "위임", module: "staking" },
  undelegate: { typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate", label: "위임 해제", module: "staking" },
  reward: { typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward", label: "위임 보상 회수", module: "distribution" },
  commission: { typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission", label: "운영자 commission 회수", module: "distribution" },
} as const;
export type StakingTxInput = SigningInput & { validatorAddress: string } & (
  { action: "delegate" | "undelegate"; amount: string; denom: string; displayAmount?: string }
  | { action: "reward" | "commission" }
);
export function stakingBlockReason(chain: ChainConfig, action: StakingAction, wallet: SigningInput["walletType"] | null): string | null {
  const definition = stakingMessages[action];
  if (!definition || chain.features?.[definition.module] !== true || chain.features?.staking !== true) return "이 행위의 staking/distribution 모듈 지원이 확인되지 않았습니다.";
  const capability = chain.stakingCapabilities?.[action];
  if (!capability || capability.typeUrl !== definition.typeUrl) return "이 행위의 메시지·수수료 지원 근거가 없습니다. 수수료 미확인으로 전송을 차단합니다.";
  if (!capability.signing.some(s => s.wallet === wallet && chain.signing?.some(c => c.wallet === wallet && c.method === s.method))) return "이 메시지의 지갑 서명 방식은 검증되지 않았습니다.";
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
    } catch { throw new Error("검증자 주소의 체크섬·길이·체인 prefix를 확인하세요."); }
    const validatorPath = `/cosmos/staking/v1beta1/validators/${encodeURIComponent(validator)}`;
    let observedRewards: Coin[] | undefined;
    const readPosition = async () => {
      const [staking, response] = await Promise.all([
        getStakingParams(query),
        query.lcdGet<unknown>(validatorPath),
        getAddressAccountInfo(sender, query),
      ]);
      assertCurrent();
      if (staking.bondDenom !== chain.bondDenom || (hasAmount && params.denom !== staking.bondDenom)) throw new Error("검증된 bond denom과 현재 staking params가 다릅니다.");
      const current = z.object({ validator: z.object({ operator_address: z.string(), jailed: z.boolean(), status: z.enum(["BOND_STATUS_BONDED", "BOND_STATUS_UNBONDED", "BOND_STATUS_UNBONDING"]) }) }).parse(response).validator;
      if (current.operator_address !== validator) throw new Error("조회 검증자와 거래 대상이 다릅니다.");
      if (params.action === "delegate" && current.jailed) throw new Error("현재 jailed 검증자에게 위임할 수 없습니다.");
      if (params.action === "commission" && sender !== operator) throw new Error("운영자 계정 권한이 일치하지 않습니다. commission 회수가 차단되었습니다.");
      if (params.action === "undelegate" || params.action === "reward") {
        const position = z.object({ delegation_response: z.object({
          delegation: z.object({ delegator_address: z.string(), validator_address: z.string() }), balance: integerCoin,
        }) }).parse(await query.lcdGet(`${validatorPath}/delegations/${encodeURIComponent(sender)}`)).delegation_response;
        assertCurrent();
        if (position.delegation.delegator_address !== sender || position.delegation.validator_address !== validator || position.balance.denom !== staking.bondDenom) throw new Error("개인 위임 포지션의 계정·검증자·denom이 다릅니다.");
        if (params.action === "undelegate" && BigInt(position.balance.amount) < BigInt(params.amount)) throw new Error("해제 수량이 해당 검증자의 위임 잔액을 초과합니다.");
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
      if (metadata?.decimals == null) throw new Error("표시 정밀도 미확인: 위임/해제 수량을 확인할 수 없습니다.");
      const padded = params.amount.padStart(metadata.decimals + 1, "0");
      displayAmount = params.displayAmount ?? (metadata.decimals ? `${padded.slice(0, -metadata.decimals)}.${padded.slice(-metadata.decimals)}` : params.amount);
      if (displayToBase(displayAmount, metadata.decimals) !== params.amount) throw new Error("표시 수량과 거래 원본이 다릅니다.");
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
      display: { action: stakingMessages[params.action].label, recipient: validator, targetLabel: "전체 검증자 주소",
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
          if (available < amount) throw new Error(`${denom} 사용 가능 잔액이 부족합니다. 현재 잔액으로 수수료${params.action === "delegate" ? "와 위임 수량" : ""}를 충당해야 합니다. 회수 예정 보상은 포함하지 않습니다.`);
        }
      },
    };
  }, assertInputCurrent);
}
