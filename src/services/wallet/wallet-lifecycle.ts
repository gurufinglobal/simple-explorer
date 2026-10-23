"use client";
import { providerErrorCode } from "@/services/evm/network";
import type { InjectedProvider } from "./injected-provider";
import { serviceText, ServiceError } from '@/i18n/service-message';

import { getActiveChainConfig } from "@/lib/chain-selection";
import type { ChainConfig } from "@/lib/env";
import type { WalletConnectMode, WalletConnectNormalizedSession } from "@/types/walletconnect";
import { useWalletSessionStore as store } from "@/stores/wallet-session.store";
import { connectWallet } from "./wallet-connector";
import { assertWalletConnectRequest, normalizeWalletConnectSession, walletConnectMethods } from "./walletconnect-session";
import { connectWalletConnectPairing, disconnectWalletConnectByTopic, getActiveWalletConnectSession, getOrCreateSignClient, getWalletConnectProjectId } from "./walletconnect-client";
import { verifyLcdChain, verifyChainEndpoints, writeBlockReason } from "./chain-eligibility";
import { walletConnectPublicKey } from "./walletconnect-public-key";

function message(error: unknown) {
  const code = providerErrorCode(error);
  if (code === 4001) return serviceText("evm_user_rejected");
  if (code === -32002) return serviceText("evm_request_pending");
  return error instanceof Error ? error.message : serviceText("wallet_connection_failed_reconnect");
}
function isCurrent(generation: number, key: string) {
  try { return store.getState().generation === generation && getActiveChainConfig().key === key; }
  catch { return false; }
}
// An approved topic already has a lifecycle while its account key is still loading.
let pendingApproval: { topic: string; generation: number } | null = null;
type ApprovalIdentity = Pick<WalletConnectNormalizedSession, "sessionTopic" | "bech32Address" | "evmAddress" | "methods"> & Partial<Pick<WalletConnectNormalizedSession, "capabilities">> & { wcMode?: WalletConnectMode | null };
async function assertLiveApproval(chain: ChainConfig, expected: ApprovalIdentity): Promise<void> {
  const session = await getActiveWalletConnectSession(expected.sessionTopic).catch(() => undefined);
  if (!session || session.topic !== expected.sessionTopic || !Number.isFinite(session.expiry) || session.expiry * 1000 <= Date.now()) {
    throw new ServiceError("walletconnect_session_is_missing_or_expired_reconnect_your_wallet");
  }
  const live = normalizeWalletConnectSession(session, chain, expected.wcMode ?? undefined);
  if (live.bech32Address !== expected.bech32Address || live.evmAddress !== expected.evmAddress ||
    JSON.stringify(live.methods ?? []) !== JSON.stringify([...(expected.methods ?? [])].sort()) ||
    (expected.capabilities && Object.keys(expected.capabilities).length > 0 && JSON.stringify(live.capabilities) !== JSON.stringify(expected.capabilities))) {
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
export async function connectExtension(wallet: "keplr" | "metamask", provider?: InjectedProvider): Promise<void> {
  const generation = store.getState().startConnecting();
  if (generation === null) return;
  try {
    const chain = getActiveChainConfig();
    const result = await connectWallet(wallet, chain, () => { if (!isCurrent(generation, chain.key)) throw new ServiceError("connection_cancelled"); }, provider);
    if (!isCurrent(generation, chain.key)) return;
    store.getState().connect(result.walletType, result.bech32Address, result.evmAddress, result);
    await refreshWriteEligibility();
  } catch (error) { if (store.getState().generation === generation) store.getState().setError(message(error)); }
}
export const WALLETCONNECT_PAIRING_TIMEOUT_MS = 5 * 60 * 1000;
export async function connectQr(onUri: (uri: string | null) => void, mode: WalletConnectMode = "cosmos"): Promise<void> {
  const generation = store.getState().startConnecting();
  if (generation === null) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let approvedTopic: string | undefined;
  try {
    const selected = getActiveChainConfig();
    const chainId = mode === "evm" ? selected.chainId : await verifyLcdChain(selected);
    const chain = { ...selected, chainId };
    if (!isCurrent(generation, chain.key)) return;
    const pairing = await connectWalletConnectPairing(chain, mode);
    if (isCurrent(generation, chain.key)) onUri(pairing.uri ?? null);
    // Always consume approval so an approval after cancellation can be disconnected.
    const approval = pairing.approval().then(async session => {
      if (!isCurrent(generation, chain.key)) await disconnectWalletConnectByTopic(session.topic).catch(() => {});
      return session;
    });
    const session = await Promise.race([approval, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ServiceError("wc_pairing_expired")), WALLETCONNECT_PAIRING_TIMEOUT_MS);
    })]);
    clearTimeout(timer);
    approvedTopic = session.topic;
    if (!isCurrent(generation, chain.key)) return;
    pendingApproval = { topic: session.topic, generation };
    const normalized = normalizeWalletConnectSession(session, chain, mode);
    if (session.expiry * 1000 <= Date.now() || (!normalized.bech32Address && !normalized.evmAddress)) {
      await disconnectWalletConnectByTopic(session.topic).catch(() => {});
      throw new ServiceError("no_approved_account_for_this_chain_or_the_session_expired");
    }
    const address = (mode === "evm" ? normalized.evmAddress : normalized.bech32Address)!;
    for (const method of walletConnectMethods(mode)) assertWalletConnectRequest(session, session.topic, chain, mode, address, method);
    const pubkey = normalized.bech32Address
      ? await walletConnectPublicKey(chain, session.topic, normalized.bech32Address, mode, () => {
        if (!isCurrent(generation, chain.key)) throw new ServiceError("connection_cancelled");
      }).catch(() => null) : null;
    if (!isCurrent(generation, chain.key)) { await disconnectWalletConnectByTopic(session.topic).catch(() => {}); return; }
    await assertLiveApproval(chain, normalized);
    if (!isCurrent(generation, chain.key)) { await disconnectWalletConnectByTopic(session.topic).catch(() => {}); return; }
    store.getState().connect("walletconnect", normalized.bech32Address, normalized.evmAddress, { ...normalized, pubkey });
    await refreshWriteEligibility();
  } catch (error) {
    if (store.getState().generation === generation) { store.getState().setError(message(error)); onUri(null); }
    if (approvedTopic) await disconnectWalletConnectByTopic(approvedTopic).catch(() => {});
  }
  finally { clearTimeout(timer); if (pendingApproval?.generation === generation) pendingApproval = null; }
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
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleExpiry = () => {
    clearTimeout(expiryTimer);
    const state = store.getState();
    if (state.status !== "connected" || state.walletType !== "walletconnect" || !state.expiry) return;
    const generation = state.generation;
    expiryTimer = setTimeout(() => {
      if (store.getState().generation !== generation) return;
      if (state.expiry! * 1000 <= Date.now()) invalidate("walletconnect");
      else scheduleExpiry();
    }, Math.max(0, Math.min(state.expiry * 1000 - Date.now(), 2147483647)));
  };
  const unsubscribe = store.subscribe(scheduleExpiry);
  scheduleExpiry();
  const onChain = () => { store.getState().disconnect(); };
  const onReturn = () => {
    if (document.visibilityState !== "hidden" && store.getState().walletType === "walletconnect") void refreshWriteEligibility();
  };
  window.addEventListener("pageshow", onReturn);
  window.addEventListener("focus", onReturn);
  document.addEventListener("visibilitychange", onReturn);
  const onKeplr = () => invalidate("keplr");
  window.addEventListener("explorer:chain-changed", onChain);
  window.addEventListener("keplr_keystorechange", onKeplr);
  if (getWalletConnectProjectId()) void getOrCreateSignClient().then(client => {
    if (disposed) return;
    const onSession = (args: { topic: string }) => {
      const state = store.getState();
      if (state.sessionTopic === args.topic ||
        (pendingApproval?.topic === args.topic && pendingApproval.generation === state.generation)) invalidate("walletconnect");
    };
    const onEvent = (args: { topic: string; params: { event: { name: string } } }) => {
      if (["accountsChanged", "chainChanged"].includes(args.params.event.name)) onSession(args);
    };
    client.on("session_event", onEvent);
    client.on("session_update", onSession);
    client.on("session_delete", onSession);
    client.on("session_expire", onSession);
    detachWc = () => {
      client.off("session_event", onEvent);
      client.off("session_update", onSession); client.off("session_delete", onSession); client.off("session_expire", onSession);
    };
  }).catch(() => {});
  return () => {
    disposed = true; detachWc?.(); unsubscribe(); clearTimeout(expiryTimer);
    window.removeEventListener("pageshow", onReturn);
    window.removeEventListener("focus", onReturn);
    document.removeEventListener("visibilitychange", onReturn);
    window.removeEventListener("explorer:chain-changed", onChain);
    window.removeEventListener("keplr_keystorechange", onKeplr);
    store.getState().disconnect();
  };
}
