"use client";
import { BroadcastTxError, calculateFee, GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { getActiveChainConfig, getChainSelectionGeneration } from "@/lib/chain-selection";
import { createQueryClient } from "@/services/clients";
import { createBoundSigningClient, type SigningInput } from "@/services/wallet/signing-context";
import { verifyChainEndpoints, writeBlockReason } from "@/services/wallet/chain-eligibility";
import { useWalletSessionStore as store } from "@/stores/wallet-session.store";
import { errorMessage, type PreparedTransaction, type TransactionReceipt } from "@/services/transactions/transaction";
import { saveReceipt } from "@/services/transactions/receipt";

import type { ChainConfig } from "@/lib/env";
import type { QueryClient } from "@/services/clients";
import type { EncodeObject } from "@cosmjs/proto-signing";
import type { StdFee } from "@cosmjs/amino";
import type { TransactionSnapshot, StakingContext, GovernanceContext } from "./transaction";

type TransactionSetup = {
  message: EncodeObject;
  policy: NonNullable<ChainConfig["sendFeePolicy"]>;
  display: Pick<TransactionSnapshot, "action" | "recipient" | "displayAmount" | "unit" | "amount" | "denom" | "observedRewards" | "targetLabel" | "governance">;
  context?: StakingContext;
  governance?: GovernanceContext;
  allowedSigning?: readonly { wallet: string; method: string }[];
  check: (fee: StdFee) => Promise<void>;
  assertValid?: () => void;
};
const inFlight = new Set<string>();

export async function prepareTransaction(params: SigningInput, setup: (context: {
  chain: ChainConfig; query: QueryClient; sender: string; assertCurrent: () => void;
}) => Promise<TransactionSetup>, assertInputCurrent: () => void = () => {}): Promise<PreparedTransaction> {
  if (typeof window === "undefined") throw new Error("거래는 브라우저에서만 실행할 수 있습니다.");
  params = { ...params };
  const chain = getActiveChainConfig();
  const chainGeneration = getChainSelectionGeneration();
  const state = store.getState();
  let cancelled = false;
  let preparedAt = 0;
  let assertActionCurrent = () => {};
  const assertCurrent = () => {
    assertInputCurrent();
    assertActionCurrent();
    if (preparedAt && Date.now() - preparedAt > 120_000) throw new Error("확인 후 2분이 지났습니다. 수수료와 잔액을 다시 확인하세요.");
    if (cancelled || getChainSelectionGeneration() !== chainGeneration || JSON.stringify(getActiveChainConfig()) !== JSON.stringify(chain) || store.getState().generation !== state.generation) {
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
  const sender = state.bech32Address!;
  const query = createQueryClient(chain);
  const { message, policy, display, context, governance, check, allowedSigning, assertValid } = await setup({ chain, query, sender, assertCurrent });
  assertActionCurrent = assertValid ?? (() => {});
  assertCurrent();
  const price = GasPrice.fromString(policy.gasPrice);
  if (price.denom !== chain.feeDenom || BigInt(price.amount.atomics) <= BigInt(0)) throw new Error("수수료 가격·자산이 검증된 체인 설정과 다릅니다.");
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
  const checkBalance = async () => { await check(fee); assertCurrent(); };
  await checkBalance();
  preparedAt = Date.now();
  const snapshot = Object.freeze({
    ...display, chainKey: chain.key, chainId: chain.chainId!, sender,
    fee: Object.freeze({ gas: fee.gas, amount: Object.freeze(fee.amount.map(c => Object.freeze({ ...c }))) }),
    feeBasis, preparedAt,
  });
  let consumed = false;
  return {
    snapshot, assertCurrent, cancel: () => { cancelled = true; },
    execute: async onBroadcast => {
      assertCurrent();
      if (Date.now() - snapshot.preparedAt > 120_000) throw new Error("확인 후 2분이 지났습니다. 수수료와 잔액을 다시 확인하세요.");
      const lock = `${chain.chainId}:${sender}`;
      if (consumed || inFlight.has(lock)) throw new Error("이미 처리 중이거나 사용한 확인입니다. 결과를 확인하세요.");
      consumed = true;
      inFlight.add(lock);
      let hash: string | null = null;
      const receipt = (status: TransactionReceipt["status"], message: string, code?: number): TransactionReceipt => ({
        chainKey: chain.key, chainId: chain.chainId!, sender, hash, status, message, code, ...(context ? { staking: context } : {}),
        ...(governance ? { governance } : {}),
        estimatedFee: fee.amount.map(c => ({ ...c })), actualFee: null,
      });
      try {
        await checkBalance();
        const { client, signerAddress } = await createBoundSigningClient(params, price, {
          assertCurrent,
          beforeSign: checkBalance, allowedSigning,
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
        if (!Number.isInteger(result.code) || result.code < 0 || !result.transactionHash || result.transactionHash.toUpperCase() !== hash) {
          const pending = receipt("pending", "노드 응답의 code/hash를 확인할 수 없습니다. 확인 중 · 자동 재전송하지 않습니다.");
          if (!saveReceipt(pending)) pending.feeWarning = "브라우저 저장 실패: 새로고침 전에 거래 링크를 보관하세요.";
          return pending;
        }
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
