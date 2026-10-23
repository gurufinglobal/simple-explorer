"use client";
import { ServiceError, serviceText } from '@/i18n/service-message';

import { validateSendAddress } from "@/lib/send-address";
import { GasPrice } from "@cosmjs/stargate";
import type { StdFee } from "@cosmjs/amino";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { assertBaseAmount, displayToBase } from "@/lib/cosmos-amount";
import type { SigningInput } from "@/services/wallet/signing-context";
import { getAddressBalances } from "./address-profile.service";
import { getDenomsMetadata } from "./token-metadata.service";
import { prepareTransaction } from "@/services/transactions/prepare";
import type { PreparedTransaction, TransactionReceipt } from "@/services/transactions/transaction";

export type SendTxInput = SigningInput & { toAddress: string; amount: string; denom: string; displayAmount?: string };
export async function prepareSendTx(params: SendTxInput, assertInputCurrent: () => void = () => {}): Promise<PreparedTransaction> {
  params = { ...params };
  assertBaseAmount(params.amount);
  return prepareTransaction(params, async ({ chain, query, sender, assertCurrent }) => {
    if (chain.features?.bank === false) throw new ServiceError("this_chain_does_not_support_the_send_message");
    const recipient = params.toAddress.trim();
    const addressValidation = validateSendAddress(recipient, chain.bech32Prefix);
    if (addressValidation.status !== "valid") throw new Error(addressValidation.message);
    if (!params.denom.trim()) throw new ServiceError("enter_the_transfer_asset_denom");
    const policy = chain.sendFeePolicy;
    if (!policy) throw new ServiceError("no_verified_transfer_fee_policy_sending_is_blocked_because_fees");
    const price = GasPrice.fromString(policy.gasPrice);
    if (price.denom !== chain.feeDenom || BigInt(price.amount.atomics) <= BigInt(0)) throw new ServiceError("fee_price_or_asset_differs_from_the_verified_chain_configuration");
    const metadata = (await getDenomsMetadata(query)).find(m => m.baseDenom === params.denom);
    assertCurrent();
    if (metadata?.decimals == null) throw new ServiceError("display_precision_unknown_sending_is_blocked_2");
    const padded = params.amount.padStart(metadata.decimals + 1, "0");
    const exactDisplay = metadata.decimals ? `${padded.slice(0, -metadata.decimals)}.${padded.slice(-metadata.decimals)}` : params.amount;
    const displayAmount = params.displayAmount ?? exactDisplay;
    if (displayToBase(displayAmount, metadata.decimals) !== params.amount) throw new ServiceError("display_amount_differs_from_the_raw_transfer_amount_review_again");
    const message = { typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: MsgSend.fromPartial({
      fromAddress: sender, toAddress: recipient, amount: [{ amount: params.amount, denom: params.denom }],
    }) };
    const check = async (fee: StdFee) => {
      const balances = await getAddressBalances(sender, query);
      assertCurrent();
      const required = new Map([[params.denom, BigInt(params.amount)]]);
      for (const coin of fee.amount) required.set(coin.denom, (required.get(coin.denom) ?? BigInt(0)) + BigInt(coin.amount));
      for (const [denom, amount] of required) {
        const available = balances.filter(c => c.denom === denom).reduce((total, c) => total + BigInt(c.amount), BigInt(0));
        if (available < amount) throw new ServiceError("insufficient_balance_check_your_balance", { value0: String(denom === price.denom ? serviceText("including_fees") : ""), value1: String(denom) });
      }
    };
    return { message, policy, check, display: {
      action: serviceText("send"), recipient, displayAmount, unit: metadata.symbol || metadata.displayDenom, amount: params.amount, denom: params.denom,
    } };
  }, assertInputCurrent);
}

/** Only an exact prepared snapshot can be submitted; there is no input shortcut. */
export function submitSendTx(prepared: PreparedTransaction, onBroadcast: (receipt: TransactionReceipt) => void = () => {}) {
  return prepared.execute(onBroadcast);
}
