"use client";
import { bech32 } from "bech32";
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
    if (chain.features?.bank === false) throw new Error("이 체인은 송금 메시지를 지원하지 않습니다.");
    const recipient = params.toAddress.trim();
    try {
      const decoded = bech32.decode(recipient);
      if (decoded.prefix !== chain.bech32Prefix || bech32.fromWords(decoded.words).length !== 20) throw new Error();
    } catch { throw new Error("수신 주소의 체크섬·길이·체인 prefix를 확인하세요."); }
    if (!params.denom.trim()) throw new Error("송금 자산 denom을 입력하세요.");
    const policy = chain.sendFeePolicy;
    if (!policy) throw new Error("검증된 송금 수수료 정책이 없습니다. 수수료 미확인으로 전송을 차단합니다.");
    const price = GasPrice.fromString(policy.gasPrice);
    if (price.denom !== chain.feeDenom || BigInt(price.amount.atomics) <= BigInt(0)) throw new Error("수수료 가격·자산이 검증된 체인 설정과 다릅니다.");
    const metadata = (await getDenomsMetadata(query)).find(m => m.baseDenom === params.denom);
    assertCurrent();
    if (metadata?.decimals == null) throw new Error("표시 정밀도 미확인: 송금할 수 없습니다.");
    const padded = params.amount.padStart(metadata.decimals + 1, "0");
    const exactDisplay = metadata.decimals ? `${padded.slice(0, -metadata.decimals)}.${padded.slice(-metadata.decimals)}` : params.amount;
    const displayAmount = params.displayAmount ?? exactDisplay;
    if (displayToBase(displayAmount, metadata.decimals) !== params.amount) throw new Error("표시 수량과 전송 원본이 다릅니다. 다시 확인하세요.");
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
        if (available < amount) throw new Error(`${denom === price.denom ? "수수료 포함 " : ""}${denom} 잔액이 부족합니다. 잔액을 확인하세요.`);
      }
    };
    return { message, policy, check, display: {
      action: "송금", recipient, displayAmount, unit: metadata.symbol || metadata.displayDenom, amount: params.amount, denom: params.denom,
    } };
  }, assertInputCurrent);
}

/** Only an exact prepared snapshot can be submitted; there is no input shortcut. */
export function submitSendTx(prepared: PreparedTransaction, onBroadcast: (receipt: TransactionReceipt) => void = () => {}) {
  return prepared.execute(onBroadcast);
}
