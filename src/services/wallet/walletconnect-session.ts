
import { ServiceError } from '@/i18n/service-message';
import type { SessionTypes } from "@walletconnect/types";
import type { ChainConfig } from "@/lib/env";
import { getActiveChainConfig } from "@/lib/chain-selection";
import type { WalletConnectNormalizedSession } from "@/types/walletconnect";

/** CAIP-10 accounts are selected only within the selected CAIP-2 chain. */
export function normalizeWalletConnectSession(session: SessionTypes.Struct, chain: ChainConfig = getActiveChainConfig()): WalletConnectNormalizedSession {
  const chains = new Set<string>();
  const cosmos = new Set<string>();
  const evm = new Set<string>();
  const methods = new Set<string>();
  for (const ns of Object.values(session.namespaces ?? {})) {
    for (const account of ns.accounts ?? []) {
      const parts = account.split(":");
      if (parts.length !== 3 || !parts[2]) continue;
      const [namespace, reference, address] = parts;
      chains.add(`${namespace}:${reference}`);
      if (namespace === "cosmos" && reference === chain.chainId) {
        cosmos.add(address);
        for (const method of ns.methods ?? []) methods.add(method);
      }
      if (namespace === "eip155" && reference === chain.evmChainId) evm.add(address);
    }
  }
  // Multiple accounts for the same chain require explicit wallet selection; never guess by array order.
  if (cosmos.size > 1 || evm.size > 1) throw new ServiceError("multiple_accounts_on_the_same_chain_approve_only_one_in");
  return {
    sessionTopic: session.topic, bech32Address: [...cosmos][0] ?? null, evmAddress: [...evm][0] ?? null,
    connectedChains: [...chains].sort(), chainKey: chain.key, chainId: chain.chainId,
    methods: [...methods].sort(),
  };
}

export function assertWalletConnectApproval(session: SessionTypes.Struct, chain: ChainConfig, address: string): void {
  if (!session || session.expiry * 1000 <= Date.now()) throw new ServiceError("walletconnect_session_expired_reconnect");
  const normalized = normalizeWalletConnectSession(session, chain);
  if (normalized.bech32Address !== address || !normalized.methods?.includes("cosmos_signAmino")) {
    throw new ServiceError("no_cosmos_signamino_approval_for_the_current_chain_and_account");
  }
}
