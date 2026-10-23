"use client";
import { describeServiceMessage, ServiceError, serviceText } from '@/i18n/service-message';

import { BroadcastTxError, calculateFee, GasPrice } from "@cosmjs/stargate";
import { connectSigningClient } from "@/services/wallet/connect-signing-client";
import { getActiveChainConfig, getChainSelectionGeneration } from "@/lib/chain-selection";
import { createQueryClient } from "@/services/clients";
import { createBoundSigningClient, type SigningInput } from "@/services/wallet/signing-context";
import { verifyChainEndpoints, writeBlockReason } from "@/services/wallet/chain-eligibility";
import { useWalletSessionStore as store } from "@/stores/wallet-session.store";
import { errorMessage, type PreparedTransaction, type TransactionReceipt } from "@/services/transactions/transaction";
import { saveReceipt } from "@/services/transactions/receipt";
import { assertCosmosWalletKey, signingAccountParser } from "@/services/wallet/signing-profile";

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
  if (typeof window === "undefined") throw new ServiceError("transactions_are_only_available_in_the_browser");
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
    if (preparedAt && Date.now() - preparedAt > 120_000) throw new ServiceError("two_minutes_have_elapsed_since_confirmation_check_fees_and_balances");
    if (cancelled || getChainSelectionGeneration() !== chainGeneration || JSON.stringify(getActiveChainConfig()) !== JSON.stringify(chain) || store.getState().generation !== state.generation) {
      throw new ServiceError("input_chain_account_or_connection_changed_review_the_transaction_again");
    }
    const now = store.getState();
    const reason = writeBlockReason(chain, now);
    if (reason) throw new Error(reason);
    if (now.bech32Address !== params.bech32Address || now.walletType !== params.walletType || now.sessionTopic !== params.sessionTopic) {
      throw new ServiceError("sender_account_differs_from_the_connected_wallet");
    }
  };
  assertCurrent();
  const sender = state.bech32Address!;
  assertCosmosWalletKey(chain, sender, state.pubkey!, "secp256k1");
  const query = createQueryClient(chain);
  const { message, policy, display, context, governance, check, allowedSigning, assertValid } = await setup({ chain, query, sender, assertCurrent });
  assertActionCurrent = assertValid ?? (() => {});
  assertCurrent();
  const price = GasPrice.fromString(policy.gasPrice);
  if (price.denom !== chain.feeDenom || BigInt(price.amount.atomics) <= BigInt(0)) throw new ServiceError("fee_price_or_asset_differs_from_the_verified_chain_configuration");
  await verifyChainEndpoints(chain);
  assertCurrent();
  let gas: number;
  let feeBasis: string;
  if (policy.mode === "simulate") {
    try {
      // Simulation uses the verified public key, never a wallet signing prompt.
      const simulator = await connectSigningClient(chain, {
        getAccounts: async () => { assertCurrent(); return [{ address: sender, algo: "secp256k1", pubkey: state.pubkey! }]; },
        signDirect: async () => { throw new ServiceError("fee_estimation_cannot_request_signatures"); },
      }, { accountParser: signingAccountParser(chain, { address: sender, pubkey: state.pubkey! }) });
      try {
        assertCurrent();
        const used = await simulator.simulate(sender, [message], "");
        assertCurrent();
        if (!Number.isSafeInteger(used) || used <= 0) throw new ServiceError("no_valid_simulated_gas_result");
        const adjusted = (BigInt(used) * BigInt(policy.gasMultiplierBps) + BigInt(9999)) / BigInt(10000);
        if (adjusted > BigInt(Number.MAX_SAFE_INTEGER)) throw new ServiceError("estimated_gas_exceeds_the_safe_range");
        gas = Number(adjusted);
        feeBasis = serviceText("simulated_gas", { value0: used, value1: policy.gasMultiplierBps, value2: policy.evidence });
      } finally { simulator.disconnect(); }
    } catch (error) {
      assertCurrent();
      if (!policy.fallback) throw new ServiceError("fee_estimation_failed", { value0: String(errorMessage(error)) });
      gas = policy.fallback.gas;
      feeBasis = serviceText("simulation_unavailable_verified_fixed_gas_actual_usage_may_differ", { value0: String(errorMessage(error)), value1: String(gas), value2: String(policy.fallback.evidence) });
    }
  } else {
    gas = policy.gas;
    feeBasis = serviceText("verified_fixed_gas", { value0: String(gas), value1: String(policy.evidence), value2: String(policy.limitation) });
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
      if (Date.now() - snapshot.preparedAt > 120_000) throw new ServiceError("two_minutes_have_elapsed_since_confirmation_check_fees_and_balances");
      const lock = `${chain.chainId}:${sender}`;
      if (consumed || inFlight.has(lock)) throw new ServiceError("this_confirmation_is_in_progress_or_already_used_check_the");
      consumed = true;
      inFlight.add(lock);
      let hash: string | null = null;
      const receipt = (status: TransactionReceipt["status"], message: string, code?: number): TransactionReceipt => ({
        chainKey: chain.key, chainId: chain.chainId!, sender, hash, status, message, ...(describeServiceMessage(message) ?? {}), code, ...(context ? { staking: context } : {}),
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
            const pending = receipt("pending", serviceText("checking_broadcast_and_inclusion_no_automatic_resubmission"));
            const saved = saveReceipt(pending);
            onBroadcast({ ...pending, ...(!saved ? { feeWarning: serviceText("browser_storage_failed_save_the_transaction_link_before_refreshing") } : {}) });
          },
        });
        assertCurrent();
        const result = await client.signAndBroadcast(signerAddress, [message], fee);
        // Preserve an already broadcast result under its original chain after a switch.
        if (!Number.isInteger(result.code) || result.code < 0 || !result.transactionHash || result.transactionHash.toUpperCase() !== hash) {
          const pending = receipt("pending", serviceText("could_not_verify_the_node_response_code_or_hash_checking"));
          if (!saveReceipt(pending)) pending.feeWarning = serviceText("browser_storage_failed_save_the_transaction_link_before_refreshing");
          return pending;
        }
        const done = receipt(result.code === 0 ? "success" : "failed",
          result.code === 0 ? serviceText("included_successfully_on_chain") : result.rawLog || serviceText("chain_execution_failed_code", { value0: String(result.code) }), result.code);
        if (!saveReceipt(done)) done.feeWarning = serviceText("browser_storage_failed_save_the_transaction_link_before_refreshing");
        return done;
      } catch (error) {
        if (!hash) {
          assertCurrent();
          if (/reject|denied|declin|cancel|거절|취소/i.test(errorMessage(error))) return receipt("cancelled", serviceText("wallet_signature_cancelled_nothing_was_sent"));
          throw error;
        }
        const result = error instanceof BroadcastTxError
          ? receipt("failed", error.log || serviceText("node_rejected_the_transaction_code", { value0: String(error.code) }), error.code)
          : receipt("pending", serviceText("checking_no_automatic_resubmission", { value0: String(errorMessage(error)) }));
        if (!saveReceipt(result)) result.feeWarning = serviceText("browser_storage_failed_save_the_transaction_link_before_refreshing");
        return result;
      } finally { inFlight.delete(lock); }
    },
  };
}
