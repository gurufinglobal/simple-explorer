import type { SessionTypes } from "@walletconnect/types";
import type { ChainConfig } from "@/lib/env";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { verifyLcdChain } from "@/services/wallet/chain-eligibility";
import { normalizeWalletConnectSession } from "@/services/wallet/walletconnect-session";
import type { SessionMeta, WalletConnectorKind } from "@/stores/wallet-session.store";
import { getKeplrSigner, readKeplrAccounts } from "./keplr";

export type WalletConnectResult = SessionMeta & {
  walletType: WalletConnectorKind; bech32Address: string | null; evmAddress: string | null;
};
export function walletConnectSessionToResult(session: SessionTypes.Struct, chain = getActiveChainConfig()): WalletConnectResult {
  return { walletType: "walletconnect", ...normalizeWalletConnectSession(session, chain) };
}
export async function connectWallet(walletType: "keplr" | "metamask", chain: ChainConfig = getActiveChainConfig(), assertCurrent: () => void = () => {}): Promise<WalletConnectResult> {
  if (typeof window === "undefined") throw new Error("브라우저에서 지갑을 연결하세요.");
  const chainId = await verifyLcdChain(chain);
  assertCurrent();
  if (walletType === "keplr") {
    const verifiedChain = { ...chain, chainId };
    const signer = await getKeplrSigner(verifiedChain, assertCurrent, true);
    const accounts = await readKeplrAccounts(signer, verifiedChain, assertCurrent);
    return { walletType, bech32Address: accounts[0].address, evmAddress: null,
      chainKey: chain.key, chainId, pubkey: accounts[0].pubkey,
      connectedChains: [`cosmos:${chainId}`] };
  }
  if (!window.ethereum?.request) throw new Error("MetaMask 지갑을 찾을 수 없습니다.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !/^0x[0-9a-f]{40}$/i.test(accounts[0])) throw new Error("MetaMask 계정을 찾을 수 없습니다.");
  return { walletType, bech32Address: null, evmAddress: accounts[0], chainKey: chain.key, chainId };
}
