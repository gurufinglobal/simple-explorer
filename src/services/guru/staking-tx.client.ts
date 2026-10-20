"use client";

import { assertBaseAmount } from "@/lib/cosmos-amount";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { calculateFee, GasPrice } from "@cosmjs/stargate";
import { MsgWithdrawDelegatorReward, MsgWithdrawValidatorCommission } from "cosmjs-types/cosmos/distribution/v1beta1/tx";
import { MsgDelegate, MsgUndelegate } from "cosmjs-types/cosmos/staking/v1beta1/tx";

import { createBoundSigningClient } from "@/services/wallet/signing-context";

type SupportedWallet = "keplr" | "metamask" | "walletconnect";

type BaseStakingTxInput = {
  walletType: SupportedWallet;
  sessionTopic: string | null;
  bech32Address: string | null;
  validatorAddress: string;
};

type StakingAmountTxInput = BaseStakingTxInput & {
  amount: string;
  denom: string;
};

function gasPrice(): GasPrice {
  const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GAS_PRICE : undefined;
  return GasPrice.fromString(raw ?? "0.001agxn");
}

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("Staking transactions must be submitted from the browser.");
  }
}


export async function submitDelegateTx(params: StakingAmountTxInput): Promise<{ txHash: string }> {
  assertBrowser();
  assertBaseAmount(params.amount);
  if (!params.denom || params.denom !== getActiveChainConfig().bondDenom) throw new Error("검증된 bond denom과 다릅니다.");

  const { client, signerAddress } = await createBoundSigningClient(params, gasPrice());
  const msg = {
    typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
    value: MsgDelegate.fromPartial({
      delegatorAddress: signerAddress,
      validatorAddress: params.validatorAddress,
      amount: { amount: params.amount, denom: params.denom },
    }),
  };
  const result = await client.signAndBroadcast(signerAddress, [msg], calculateFee(350_000, gasPrice()));
  if (result.code !== 0) {
    throw new Error(result.rawLog || `Tx failed with code ${result.code}`);
  }
  return { txHash: result.transactionHash };
}

export async function submitUndelegateTx(params: StakingAmountTxInput): Promise<{ txHash: string }> {
  assertBrowser();
  assertBaseAmount(params.amount);
  if (!params.denom || params.denom !== getActiveChainConfig().bondDenom) throw new Error("검증된 bond denom과 다릅니다.");

  const { client, signerAddress } = await createBoundSigningClient(params, gasPrice());
  const msg = {
    typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate",
    value: MsgUndelegate.fromPartial({
      delegatorAddress: signerAddress,
      validatorAddress: params.validatorAddress,
      amount: { amount: params.amount, denom: params.denom },
    }),
  };
  const result = await client.signAndBroadcast(signerAddress, [msg], calculateFee(350_000, gasPrice()));
  if (result.code !== 0) {
    throw new Error(result.rawLog || `Tx failed with code ${result.code}`);
  }
  return { txHash: result.transactionHash };
}

export async function submitWithdrawDelegatorRewardTx(
  params: BaseStakingTxInput,
): Promise<{ txHash: string }> {
  assertBrowser();
  const { client, signerAddress } = await createBoundSigningClient(params, gasPrice());
  const msg = {
    typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
    value: MsgWithdrawDelegatorReward.fromPartial({
      delegatorAddress: signerAddress,
      validatorAddress: params.validatorAddress,
    }),
  };
  const result = await client.signAndBroadcast(signerAddress, [msg], calculateFee(250_000, gasPrice()));
  if (result.code !== 0) {
    throw new Error(result.rawLog || `Tx failed with code ${result.code}`);
  }
  return { txHash: result.transactionHash };
}

export async function submitWithdrawValidatorCommissionTx(
  params: BaseStakingTxInput,
): Promise<{ txHash: string }> {
  assertBrowser();
  const { client, signerAddress } = await createBoundSigningClient(params, gasPrice());
  const msg = {
    typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission",
    value: MsgWithdrawValidatorCommission.fromPartial({
      validatorAddress: params.validatorAddress,
    }),
  };
  const result = await client.signAndBroadcast(signerAddress, [msg], calculateFee(250_000, gasPrice()));
  if (result.code !== 0) {
    throw new Error(result.rawLog || `Tx failed with code ${result.code}`);
  }
  return { txHash: result.transactionHash };
}
