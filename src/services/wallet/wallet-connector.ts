import type { SessionTypes } from "@walletconnect/types";
import { getNetworkSummary } from "@/services/guru/network-summary.service";
import { normalizeWalletConnectSession } from "@/services/wallet/walletconnect-session";
import type { WalletConnectorKind } from "@/stores/wallet-session.store";

export type WalletConnectResult = {
  walletType: WalletConnectorKind;
  bech32Address: string | null;
  evmAddress: string | null;
  sessionTopic?: string | null;
  connectedChains?: string[];
};

export function walletConnectSessionToResult(session: SessionTypes.Struct): WalletConnectResult {
  const normalized = normalizeWalletConnectSession(session);
  return {
    walletType: "walletconnect",
    bech32Address: normalized.bech32Address,
    evmAddress: normalized.evmAddress,
    sessionTopic: normalized.sessionTopic,
    connectedChains: normalized.connectedChains,
  };
}

async function connectKeplr(): Promise<WalletConnectResult> {
  if (typeof window === "undefined" || !window.keplr || !window.getOfflineSigner) {
    throw new Error("Keplr 지갑을 찾을 수 없습니다.");
  }

  const network = await getNetworkSummary();
  const chainId = network.chainId;
  await window.keplr.enable(chainId);
  const signer = window.getOfflineSigner(chainId);
  const accounts = await signer.getAccounts();
  const bech32Address = accounts[0]?.address ?? null;

  if (!bech32Address) {
    throw new Error("Keplr 계정을 찾을 수 없습니다.");
  }

  return {
    walletType: "keplr",
    bech32Address,
    evmAddress: null,
  };
}

async function connectMetamask(): Promise<WalletConnectResult> {
  if (typeof window === "undefined" || !window.ethereum?.request) {
    throw new Error("MetaMask 지갑을 찾을 수 없습니다.");
  }

  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  const evmAddress = accounts[0] ?? null;
  if (!evmAddress) {
    throw new Error("MetaMask 계정을 찾을 수 없습니다.");
  }

  return {
    walletType: "metamask",
    bech32Address: null,
    evmAddress,
  };
}

export async function connectWallet(walletType: "keplr" | "metamask"): Promise<WalletConnectResult> {
  if (process.env.NODE_ENV === "test") {
    return {
      walletType,
      bech32Address: walletType === "keplr" ? "guru1demoaddress0000000000000000000000000" : null,
      evmAddress: walletType === "metamask" ? "0x0000000000000000000000000000000000000001" : null,
    };
  }

  if (walletType === "keplr") {
    return connectKeplr();
  }
  return connectMetamask();
}
