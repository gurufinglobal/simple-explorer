"use client";
import { serviceText, ServiceError } from '@/i18n/service-message';

import { getActiveChainConfig } from "@/lib/chain-selection";
import type { ChainConfig } from "@/lib/env";
import type { WalletConnectNormalizedSession } from "@/types/walletconnect";
import { useWalletSessionStore as store } from "@/stores/wallet-session.store";
import { connectWallet } from "./wallet-connector";
import { normalizeWalletConnectSession } from "./walletconnect-session";
import { connectWalletConnectPairing, disconnectWalletConnectByTopic, getActiveWalletConnectSession, getOrCreateSignClient, getWalletConnectProjectId } from "./walletconnect-client";
import { verifyLcdChain, verifyChainEndpoints, writeBlockReason } from "./chain-eligibility";
import { getAccountPubkeyBytes } from "@/services/guru/governance-query.service";
import { createQueryClient } from "@/services/clients";

function message(error: unknown) { return error instanceof Error ? error.message : serviceText("wallet_connection_failed_reconnect"); }
function isCurrent(generation: number, key: string) {
  try { return store.getState().generation === generation && getActiveChainConfig().key === key; }
  catch { return false; }
}
// An approved topic already has a lifecycle while its account key is still loading.
let pendingApproval: { topic: string; generation: number } | null = null;
type ApprovalIdentity = Pick<WalletConnectNormalizedSession, "sessionTopic" | "bech32Address" | "evmAddress" | "methods">;
async function assertLiveApproval(chain: ChainConfig, expected: ApprovalIdentity): Promise<void> {
  const session = await getActiveWalletConnectSession(expected.sessionTopic).catch(() => undefined);
  if (!session || session.topic !== expected.sessionTopic || !Number.isFinite(session.expiry) || session.expiry * 1000 <= Date.now()) {
    throw new ServiceError("walletconnect_session_is_missing_or_expired_reconnect_your_wallet");
  }
  const live = normalizeWalletConnectSession(session, chain);
  if (live.bech32Address !== expected.bech32Address || live.evmAddress !== expected.evmAddress ||
    JSON.stringify(live.methods ?? []) !== JSON.stringify([...(expected.methods ?? [])].sort())) {
    throw new ServiceError("walletconnect_chain_account_or_approval_changed_reconnect_your_wallet");
  }
}
export async function refreshWriteEligibility(): Promise<void> {
  const state = store.getState();
  if (state.status !== "connected") return;
  const generation = state.generation;
  try {
    const chain = getActiveChainConfig();
    const validateSession = async () => {
      if (state.walletType === "walletconnect") {
        try {
          if (!state.sessionTopic) throw new ServiceError("walletconnect_session_missing_reconnect_your_wallet");
          await assertLiveApproval(chain, { ...state, sessionTopic: state.sessionTopic });
        } catch (error) {
          if (isCurrent(generation, chain.key)) store.getState().setError(message(error));
          return false;
        }
      }
      return isCurrent(generation, chain.key);
    };
    if (!await validateSession() || !isCurrent(generation, chain.key)) return;
    const reason = writeBlockReason(chain, state);
    if (reason) { store.setState({ writeStatus: "blocked", writeReason: reason }); return; }
    store.setState({ writeStatus: "checking", writeReason: serviceText("checking_lcd_rpc_chain_identity_and_access") });
    await verifyChainEndpoints(chain);
    if (await validateSession() && isCurrent(generation, chain.key)) store.setState({ writeStatus: "ready", writeReason: null });
  } catch (error) {
    if (store.getState().generation === generation) store.setState({ writeStatus: "blocked", writeReason: message(error) });
  }
}
export async function connectExtension(wallet: "keplr" | "metamask"): Promise<void> {
  const generation = store.getState().startConnecting();
  if (generation === null) return;
  try {
    const chain = getActiveChainConfig();
    const result = await connectWallet(wallet, chain, () => { if (!isCurrent(generation, chain.key)) throw new ServiceError("connection_cancelled"); });
    if (!isCurrent(generation, chain.key)) return;
    store.getState().connect(result.walletType, result.bech32Address, result.evmAddress, result);
    await refreshWriteEligibility();
  } catch (error) { if (store.getState().generation === generation) store.getState().setError(message(error)); }
}
export async function connectQr(onUri: (uri: string | null) => void): Promise<void> {
  const generation = store.getState().startConnecting();
  if (generation === null) return;
  try {
    const selected = getActiveChainConfig();
    const chainId = await verifyLcdChain(selected);
    const chain = { ...selected, chainId };
    if (!isCurrent(generation, chain.key)) return;
    const pairing = await connectWalletConnectPairing(chain);
    if (isCurrent(generation, chain.key)) onUri(pairing.uri ?? null);
    // Always consume approval so an approval after cancellation can be disconnected.
    const session = await pairing.approval();
    if (!isCurrent(generation, chain.key)) { await disconnectWalletConnectByTopic(session.topic).catch(() => {}); return; }
    pendingApproval = { topic: session.topic, generation };
    const normalized = normalizeWalletConnectSession(session, chain);
    if (session.expiry * 1000 <= Date.now() || (!normalized.bech32Address && !normalized.evmAddress)) {
      await disconnectWalletConnectByTopic(session.topic).catch(() => {});
      throw new ServiceError("no_approved_account_for_this_chain_or_the_session_expired");
    }
    const pubkey = normalized.bech32Address
      ? await getAccountPubkeyBytes(normalized.bech32Address, createQueryClient(chain)).catch(() => null) : null;
    if (!isCurrent(generation, chain.key)) { await disconnectWalletConnectByTopic(session.topic).catch(() => {}); return; }
    await assertLiveApproval(chain, normalized);
    if (!isCurrent(generation, chain.key)) { await disconnectWalletConnectByTopic(session.topic).catch(() => {}); return; }
    store.getState().connect("walletconnect", normalized.bech32Address, normalized.evmAddress, { ...normalized, pubkey });
    await refreshWriteEligibility();
  } catch (error) { if (store.getState().generation === generation) store.getState().setError(message(error)); }
  finally { if (pendingApproval?.generation === generation) pendingApproval = null; }
}
export async function disconnectWallet(): Promise<void> {
  const topic = store.getState().sessionTopic;
  store.getState().disconnect();
  if (topic) await disconnectWalletConnectByTopic(topic).catch(() => {});
}

/** Mount once. Events invalidate synchronously; reconnection is always explicit. */
export function attachWalletLifecycle(): () => void {
  let disposed = false;
  let detachWc: (() => void) | undefined;
  const invalidate = (wallet?: string) => {
    const state = store.getState();
    if (state.status === "disconnected" || (wallet && state.walletType && state.walletType !== wallet)) return;
    state.setError(serviceText("chain_account_or_session_changed_reconnect_your_wallet"));
  };
  const onChain = () => { store.getState().disconnect(); };
  const onKeplr = () => invalidate("keplr");
  const onEthereum = () => invalidate("metamask");
  window.addEventListener("explorer:chain-changed", onChain);
  window.addEventListener("keplr_keystorechange", onKeplr);
  const ethereum = window.ethereum;
  ethereum?.on?.("accountsChanged", onEthereum);
  ethereum?.on?.("chainChanged", onEthereum);
  ethereum?.on?.("disconnect", onEthereum);
  if (getWalletConnectProjectId()) void getOrCreateSignClient().then(client => {
    if (disposed) return;
    const onSession = (args: { topic: string }) => {
      const state = store.getState();
      if (state.sessionTopic === args.topic ||
        (pendingApproval?.topic === args.topic && pendingApproval.generation === state.generation)) invalidate("walletconnect");
    };
    client.on("session_update", onSession);
    client.on("session_delete", onSession);
    client.on("session_expire", onSession);
    detachWc = () => {
      client.off("session_update", onSession); client.off("session_delete", onSession); client.off("session_expire", onSession);
    };
  }).catch(() => {});
  return () => {
    disposed = true; detachWc?.();
    window.removeEventListener("explorer:chain-changed", onChain);
    window.removeEventListener("keplr_keystorechange", onKeplr);
    ethereum?.removeListener?.("accountsChanged", onEthereum);
    ethereum?.removeListener?.("chainChanged", onEthereum);
    ethereum?.removeListener?.("disconnect", onEthereum);
    store.getState().disconnect();
  };
}
