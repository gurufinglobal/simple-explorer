import { ServiceError } from '@/i18n/service-message';
import type { SessionTypes } from "@walletconnect/types";
import type { ChainConfig } from "@/lib/env";
import { getActiveChainConfig } from "@/lib/chain-selection";
import type { WalletConnectCapabilities, WalletConnectMode, WalletConnectNormalizedSession } from "@/types/walletconnect";

export function walletConnectChainId(chain: ChainConfig, mode: WalletConnectMode): string {
  if (mode === "evm") {
    if (!chain.evmChainId || !/^[1-9][0-9]*$/.test(chain.evmChainId)) throw new ServiceError("wc_evm_chain_unverified");
    return `eip155:${chain.evmChainId}`;
  }
  if (!chain.chainId) throw new ServiceError("walletconnect_chain_mismatch");
  return `cosmos:${chain.chainId}`;
}
export function walletConnectMethods(mode: WalletConnectMode): string[] {
  return mode === "evm" ? ["eth_sendTransaction"] : mode === "keplr" ? ["keplr_getKey", "keplr_signAmino"] : ["cosmos_signAmino"];
}

/** Retain each namespace's grants independently, including chain-specific keys. */
export function normalizeWalletConnectSession(session: SessionTypes.Struct, chain: ChainConfig = getActiveChainConfig(), wcMode?: WalletConnectMode): WalletConnectNormalizedSession {
  const capabilities: WalletConnectCapabilities = {};
  const chains = new Set<string>();
  const cosmos = new Set<string>();
  const evm = new Map<string, string>();
  const methods = new Set<string>();
  for (const [key, ns] of Object.entries(session.namespaces ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const validAccounts = (ns.accounts ?? []).filter(account => {
      const parts = account.split(":");
      return parts.length === 3 && !!parts[2] && parts[0] === key.split(":")[0] &&
        (!key.includes(":") || key === `${parts[0]}:${parts[1]}`) &&
        (!ns.chains || ns.chains.includes(`${parts[0]}:${parts[1]}`)) &&
        (parts[0] !== "eip155" || (/^[1-9][0-9]*$/.test(parts[1]) && /^0x[0-9a-f]{40}$/i.test(parts[2])));
    });
    capabilities[key] = { accounts: [...new Set(validAccounts)].sort(), methods: [...new Set(ns.methods ?? [])].sort(), events: [...new Set(ns.events ?? [])].sort() };
    for (const account of validAccounts) {
      const [namespace, reference, address] = account.split(":");
      chains.add(`${namespace}:${reference}`);
      if (namespace === "cosmos" && reference === chain.chainId) {
        cosmos.add(address);
        for (const method of ns.methods ?? []) methods.add(method);
      }
      if (namespace === "eip155" && reference === chain.evmChainId) evm.set(address.toLowerCase(), address);
    }
  }
  if ((wcMode !== "evm" && cosmos.size > 1) || ((!wcMode || wcMode === "evm") && evm.size > 1)) throw new ServiceError("multiple_accounts_on_the_same_chain_approve_only_one_in");
  return {
    sessionTopic: session.topic, expiry: session.expiry, bech32Address: wcMode === "evm" ? null : [...cosmos][0] ?? null,
    evmAddress: wcMode && wcMode !== "evm" ? null : [...evm.values()][0] ?? null,
    connectedChains: [...chains].sort(), chainKey: chain.key, chainId: chain.chainId,
    methods: [...methods].sort(), capabilities, ...(wcMode ? { wcMode } : {}),
  };
}

export function assertWalletConnectRequest(session: SessionTypes.Struct | undefined, topic: string, chain: ChainConfig, mode: WalletConnectMode, address: string, method: string): void {
  if (!session || session.topic !== topic || !Number.isFinite(session.expiry) || session.expiry * 1000 <= Date.now()) throw new ServiceError("walletconnect_session_expired_reconnect");
  const normalized = normalizeWalletConnectSession(session, chain, mode);
  const selected = mode === "evm" ? normalized.evmAddress : normalized.bech32Address;
  const expected = mode === "evm" ? address.toLowerCase() : address;
  const caipAccount = `${walletConnectChainId(chain, mode)}:${expected}`;
  if ((mode === "evm" ? selected?.toLowerCase() : selected) !== expected || !Object.values(normalized.capabilities).some(ns => ns.methods.includes(method) &&
    ns.accounts.some(account => (mode === "evm" ? account.toLowerCase() : account) === caipAccount))) {
    throw new ServiceError("wc_request_not_approved");
  }
}
export function assertWalletConnectApproval(session: SessionTypes.Struct, chain: ChainConfig, address: string, mode: WalletConnectMode = "cosmos", topic = session?.topic): void {
  assertWalletConnectRequest(session, topic, chain, mode, address, mode === "keplr" ? "keplr_signAmino" : "cosmos_signAmino");
}
