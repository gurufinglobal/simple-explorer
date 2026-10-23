"use client";
import { ServiceError } from "@/i18n/service-message";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { useWalletSessionStore as store } from "@/stores/wallet-session.store";
import { getOrCreateSignClient } from "./walletconnect-client";
import { assertWalletConnectRequest, walletConnectChainId } from "./walletconnect-session";

/** Bound EIP-1193 subset. Transaction preparation/UI belongs to the next stage. */
export function createWalletConnectEvmProvider() {
  const state = store.getState();
  const chain = getActiveChainConfig();
  const topic = state.sessionTopic;
  const address = state.evmAddress;
  const chainId = walletConnectChainId(chain, "evm");
  const assertCurrent = () => {
    const now = store.getState();
    if (!topic || !address || now.status !== "connected" || now.walletType !== "walletconnect" || now.wcMode !== "evm" ||
      now.generation !== state.generation || now.sessionTopic !== topic || now.evmAddress !== address || getActiveChainConfig().key !== chain.key || walletConnectChainId(getActiveChainConfig(), "evm") !== chainId) {
      throw new ServiceError("chain_wallet_or_account_changed_reconnect_and_review_the_transaction");
    }
  };
  assertCurrent();
  return {
    request: async ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
      assertCurrent();
      if (!["eth_chainId", "eth_accounts", "eth_sendTransaction"].includes(method)) throw new ServiceError("wc_request_not_approved");
      let tx: Record<string, unknown> | undefined;
      if (method === "eth_sendTransaction") {
        if (!Array.isArray(params) || params.length !== 1 || !params[0] || typeof params[0] !== "object") throw new ServiceError("wc_evm_transaction_mismatch");
        tx = { ...params[0] };
        if (typeof tx!.from !== "string" || tx!.from.toLowerCase() !== address!.toLowerCase() ||
          (tx!.chainId !== undefined && (typeof tx!.chainId !== "string" || !/^0x[0-9a-f]+$/i.test(tx!.chainId) || BigInt(tx!.chainId) !== BigInt(chain.evmChainId!)))) throw new ServiceError("wc_evm_transaction_mismatch");
      }
      const client = await getOrCreateSignClient();
      assertCurrent();
      assertWalletConnectRequest(client.session.get(topic!), topic!, chain, "evm", address!, "eth_sendTransaction");
      if (method === "eth_accounts") return [address];
      if (method === "eth_chainId") return `0x${BigInt(chain.evmChainId!).toString(16)}`;
      const result = await client.request({ topic: topic!, chainId, request: { method, params: [tx] } });
      assertCurrent();
      assertWalletConnectRequest(client.session.get(topic!), topic!, chain, "evm", address!, method);
      return result;
    },
  };
}
