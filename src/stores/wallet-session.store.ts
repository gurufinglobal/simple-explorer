import { create } from "zustand";
import type { WalletConnectNormalizedSession } from "@/types/walletconnect";
import { useWalletPortfolioStore } from "@/stores/wallet-portfolio.store";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";
export type WalletConnectorKind = "keplr" | "metamask" | "walletconnect";
export type SessionMeta = {
  sessionTopic?: string | null; connectedChains?: string[];
  chainKey?: string; chainId?: string; pubkey?: Uint8Array | null;
  methods?: string[];
};
export type WalletSessionState = {
  status: WalletStatus; bech32Address: string | null; evmAddress: string | null;
  walletType: WalletConnectorKind | null; sessionTopic: string | null;
  connectedChains: string[]; lastError: string | null;
  chainKey: string | null; chainId: string | null; pubkey: Uint8Array | null;
  methods: string[]; generation: number;
  writeStatus: "blocked" | "checking" | "ready"; writeReason: string | null;
  startConnecting: () => number | null;
  connect: (walletType: WalletConnectorKind, bech32Address: string | null, evmAddress: string | null, meta?: SessionMeta) => void;
  applyWalletConnectNormalized: (normalized: WalletConnectNormalizedSession) => void;
  disconnect: () => void; setError: (message?: string) => void;
};
const cleared = {
  bech32Address: null, evmAddress: null, walletType: null, sessionTopic: null,
  connectedChains: [], chainKey: null, chainId: null, pubkey: null, methods: [],
  writeStatus: "blocked" as const, writeReason: "조회 전용 · 지갑을 연결하세요.", lastError: null,
};
export const useWalletSessionStore = create<WalletSessionState>((set, get) => ({
  ...cleared, status: "disconnected", generation: 0,
  startConnecting: () => {
    if (get().status === "connecting") return null;
    useWalletPortfolioStore.getState().clear();
    const generation = get().generation + 1;
    set({ ...cleared, status: "connecting", generation, writeReason: "연결 확인 중 · 취소 후 다시 연결할 수 있습니다." });
    return generation;
  },
  connect: (walletType, bech32Address, evmAddress, meta) => {
    if (!bech32Address && !evmAddress) { get().setError("지갑 계정이 없습니다. 다시 연결하세요."); return; }
    useWalletPortfolioStore.getState().clear();
    set({ ...cleared, status: "connected", walletType, bech32Address, evmAddress,
      sessionTopic: meta?.sessionTopic ?? null, connectedChains: meta?.connectedChains ?? [],
      chainKey: meta?.chainKey ?? null, chainId: meta?.chainId ?? null,
      pubkey: meta?.pubkey ?? null, methods: meta?.methods ?? [],
      generation: get().generation + 1, writeReason: "쓰기 조건을 확인 중입니다.",
    });
  },
  applyWalletConnectNormalized: n => get().connect("walletconnect", n.bech32Address, n.evmAddress, n),
  disconnect: () => {
    useWalletPortfolioStore.getState().clear();
    set({ ...cleared, status: "disconnected", generation: get().generation + 1 });
  },
  setError: message => {
    useWalletPortfolioStore.getState().clear();
    set({ ...cleared, status: "error", generation: get().generation + 1, lastError: message ?? null,
      writeReason: message ?? "연결 오류 · 다시 연결하세요." });
  },
}));
