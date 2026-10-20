"use client";
import { bech32 } from "bech32";
import { BroadcastTxError, calculateFee, GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { assertBaseAmount, displayToBase } from "@/lib/cosmos-amount";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { createQueryClient } from "@/services/clients";
import { createBoundSigningClient, type SigningInput } from "@/services/wallet/signing-context";
import { verifyChainEndpoints, writeBlockReason } from "@/services/wallet/chain-eligibility";
import { useWalletSessionStore as store } from "@/stores/wallet-session.store";
import { getAddressBalances } from "./address-profile.service";
import { getDenomsMetadata } from "./token-metadata.service";
import { errorMessage, type PreparedTransaction, type TransactionReceipt } from "@/services/transactions/transaction";
import { saveReceipt } from "@/services/transactions/receipt";

export type SendTxInput = SigningInput & { toAddress: string; amount: string; denom: string; displayAmount?: string };
const inFlight = new Set<string>();

export async function prepareSendTx(params: SendTxInput, assertInputCurrent: () => void = () => {}): Promise<PreparedTransaction> {
  if (typeof window === "undefined") throw new Error("송금은 브라우저에서만 실행할 수 있습니다.");
  params = { ...params };
  assertBaseAmount(params.amount);
  const chain = getActiveChainConfig();
  const state = store.getState();
  let cancelled = false;
  let preparedAt = 0;
  const assertCurrent = () => {
    assertInputCurrent();
    if (preparedAt && Date.now() - preparedAt > 120_000) throw new Error("확인 후 2분이 지났습니다. 수수료와 잔액을 다시 확인하세요.");
    if (cancelled || JSON.stringify(getActiveChainConfig()) !== JSON.stringify(chain) || store.getState().generation !== state.generation) {
      throw new Error("입력·체인·계정·연결이 변경되었습니다. 거래를 다시 확인하세요.");
    }
    const now = store.getState();
    const reason = writeBlockReason(chain, now);
    if (reason) throw new Error(reason);
    if (now.bech32Address !== params.bech32Address || now.walletType !== params.walletType || now.sessionTopic !== params.sessionTopic) {
      throw new Error("현재 지갑 연결과 송신 계정이 다릅니다.");
    }
  };
  assertCurrent();
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
  const sender = state.bech32Address!;
  const query = createQueryClient(chain);
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
  await verifyChainEndpoints(chain);
  assertCurrent();
  let gas: number;
  let feeBasis: string;
  if (policy.mode === "simulate") {
    try {
      // Simulation uses the verified public key, never a wallet signing prompt.
      const simulator = await SigningStargateClient.connectWithSigner(chain.rpcUrl!, {
        getAccounts: async () => { assertCurrent(); return [{ address: sender, algo: "secp256k1", pubkey: state.pubkey! }]; },
        signDirect: async () => { throw new Error("수수료 추정은 서명할 수 없습니다."); },
      });
      try {
        assertCurrent();
        const used = await simulator.simulate(sender, [message], "");
        assertCurrent();
        if (!Number.isSafeInteger(used) || used <= 0) throw new Error("유효한 simulate gas를 받지 못했습니다.");
        const adjusted = (BigInt(used) * BigInt(policy.gasMultiplierBps) + BigInt(9999)) / BigInt(10000);
        if (adjusted > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("추정 gas가 안전 범위를 초과했습니다.");
        gas = Number(adjusted);
        feeBasis = `simulate gas ${used} × ${policy.gasMultiplierBps}/10000 · ${policy.evidence}`;
      } finally { simulator.disconnect(); }
    } catch (error) {
      assertCurrent();
      if (!policy.fallback) throw new Error(`수수료 추정 실패 · ${errorMessage(error)}`);
      gas = policy.fallback.gas;
      feeBasis = `simulate 불가 (${errorMessage(error)}). 검증된 고정 gas ${gas} · ${policy.fallback.evidence} · 실제 소모량과 다를 수 있습니다.`;
    }
  } else {
    gas = policy.gas;
    feeBasis = `검증된 고정 gas ${gas} · ${policy.evidence} · ${policy.limitation}`;
  }
  assertCurrent();
  const fee = calculateFee(gas, price);
  const checkBalance = async () => {
    const balances = await getAddressBalances(sender, query);
    assertCurrent();
    const required = new Map([[params.denom, BigInt(params.amount)]]);
    for (const coin of fee.amount) required.set(coin.denom, (required.get(coin.denom) ?? BigInt(0)) + BigInt(coin.amount));
    for (const [denom, amount] of required) {
      const available = balances.filter(c => c.denom === denom).reduce((total, c) => total + BigInt(c.amount), BigInt(0));
      if (available < amount) throw new Error(`${denom === price.denom ? "수수료 포함 " : ""}${denom} 잔액이 부족합니다. 잔액을 확인하세요.`);
    }
  };
  await checkBalance();
  preparedAt = Date.now();
  const snapshot = Object.freeze({
    action: "송금", chainKey: chain.key, chainId: chain.chainId!, sender, recipient,
    displayAmount, unit: metadata.symbol || metadata.displayDenom, amount: params.amount, denom: params.denom,
    fee: Object.freeze({ gas: fee.gas, amount: Object.freeze(fee.amount.map(c => Object.freeze({ ...c }))) }),
    feeBasis, preparedAt,
  });
  let consumed = false;
  return {
    snapshot, assertCurrent, cancel: () => { cancelled = true; },
    execute: async onBroadcast => {
      assertCurrent();
      if (Date.now() - snapshot.preparedAt > 120_000) throw new Error("확인 후 2분이 지났습니다. 수수료와 잔액을 다시 확인하세요.");
      const lock = `${chain.key}:${sender}`;
      if (consumed || inFlight.has(lock)) throw new Error("이미 처리 중이거나 사용한 확인입니다. 결과를 확인하세요.");
      consumed = true;
      inFlight.add(lock);
      let hash: string | null = null;
      const receipt = (status: TransactionReceipt["status"], message: string, code?: number): TransactionReceipt => ({
        chainKey: chain.key, chainId: chain.chainId!, sender, hash, status, message, code,
        estimatedFee: fee.amount.map(c => ({ ...c })), actualFee: null,
      });
      try {
        await checkBalance();
        const { client, signerAddress } = await createBoundSigningClient(params, price, {
          assertCurrent,
          onBroadcast: txHash => {
            hash = txHash;
            const pending = receipt("pending", "전송·포함 확인 중 · 자동 재전송하지 않습니다.");
            const saved = saveReceipt(pending);
            onBroadcast({ ...pending, ...(!saved ? { feeWarning: "브라우저 저장 실패: 새로고침 전에 거래 링크를 보관하세요." } : {}) });
          },
        });
        assertCurrent();
        const result = await client.signAndBroadcast(signerAddress, [message], fee);
        // Preserve an already broadcast result under its original chain after a switch.
        if (result.transactionHash) hash = result.transactionHash;
        const done = receipt(result.code === 0 ? "success" : "failed",
          result.code === 0 ? "체인 포함 성공" : result.rawLog || `체인 실행 실패 (code ${result.code})`, result.code);
        if (!saveReceipt(done)) done.feeWarning = "브라우저 저장 실패: 새로고침 전에 거래 링크를 보관하세요.";
        return done;
      } catch (error) {
        if (!hash) {
          assertCurrent();
          if (/reject|denied|declin|cancel|거절|취소/i.test(errorMessage(error))) return receipt("cancelled", "지갑 서명이 취소되었습니다. 전송하지 않았습니다.");
          throw error;
        }
        const result = error instanceof BroadcastTxError
          ? receipt("failed", error.log || `노드가 거래를 거절했습니다 (code ${error.code})`, error.code)
          : receipt("pending", `확인 중 · ${errorMessage(error)} · 자동 재전송하지 않습니다.`);
        if (!saveReceipt(result)) result.feeWarning = "브라우저 저장 실패: 새로고침 전에 거래 링크를 보관하세요.";
        return result;
      } finally { inFlight.delete(lock); }
    },
  };
}

/** Only an exact prepared snapshot can be submitted; there is no input shortcut. */
export function submitSendTx(prepared: PreparedTransaction, onBroadcast: (receipt: TransactionReceipt) => void = () => {}) {
  return prepared.execute(onBroadcast);
}
