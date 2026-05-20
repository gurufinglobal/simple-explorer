import { create } from "zustand";
import type { WalletConnectNormalizedSession } from "@/types/walletconnect";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

export type WalletConnectorKind = "keplr" | "metamask" | "walletconnect";

export type WalletSessionState = {
  status: WalletStatus;
  bech32Address: string | null;
  evmAddress: string | null;
  walletType: WalletConnectorKind | null;
  sessionTopic: string | null;
  connectedChains: string[];
  lastError: string | null;
  startConnecting: () => void;
  connect: (
    walletType: WalletConnectorKind,
    bech32Address: string | null,
    evmAddress: string | null,
    meta?: {
      sessionTopic?: string | null;
      connectedChains?: string[];
    },
  ) => void;
  applyWalletConnectNormalized: (normalized: WalletConnectNormalizedSession) => void;
  disconnect: () => void;
  setError: (message?: string) => void;
};

export const useWalletSessionStore = create<WalletSessionState>((set) => ({
  status: "disconnected",
  bech32Address: null,
  evmAddress: null,
  walletType: null,
  sessionTopic: null,
  connectedChains: [],
  lastError: null,
  startConnecting: () => set({ status: "connecting", lastError: null }),
  connect: (walletType, bech32Address, evmAddress, meta) =>
    set({
      status: "connected",
      bech32Address,
      evmAddress,
      walletType,
      sessionTopic: meta?.sessionTopic ?? null,
      connectedChains: meta?.connectedChains ?? [],
      lastError: null,
    }),
  applyWalletConnectNormalized: (normalized) =>
    set({
      status: "connected",
      walletType: "walletconnect",
      bech32Address: normalized.bech32Address,
      evmAddress: normalized.evmAddress,
      sessionTopic: normalized.sessionTopic,
      connectedChains: normalized.connectedChains,
      lastError: null,
    }),
  disconnect: () =>
    set({
      status: "disconnected",
      bech32Address: null,
      evmAddress: null,
      walletType: null,
      sessionTopic: null,
      connectedChains: [],
      lastError: null,
    }),
  setError: (message) =>
    set({
      status: "error",
      lastError: message ?? null,
    }),
}));
