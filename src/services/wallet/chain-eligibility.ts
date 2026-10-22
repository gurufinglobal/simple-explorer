import { bech32 } from "bech32";
import type { ChainConfig } from "@/lib/env";
import { requestJson } from "@/services/clients";
import type { WalletSessionState } from "@/stores/wallet-session.store";
import { signingProfileBlockReason } from "./signing-profile";

export async function verifyLcdChain(chain: ChainConfig): Promise<string> {
  const response = await requestJson<{ default_node_info?: { network?: string } }>(`${chain.lcdUrl.replace(/\/$/, "")}/cosmos/base/tendermint/v1beta1/node_info`);
  const chainId = response.default_node_info?.network;
  if (!chainId || (chain.chainId && chain.chainId !== chainId)) throw new Error("LCD chain ID가 선택 체인 설정과 일치하지 않습니다.");
  return chainId;
}

export function writeBlockReason(chain: ChainConfig, state: WalletSessionState): string | null {
  if (state.status !== "connected") return "조회 전용 · 지갑을 연결하세요.";
  if (state.chainKey !== chain.key || !chain.chainId || state.chainId !== chain.chainId) return "체인·지갑 연결이 일치하지 않습니다. 다시 연결하세요.";
  if (state.walletType === "metamask") return "MetaMask는 Cosmos 조회 전용입니다. Keplr 또는 WalletConnect로 다시 연결하세요.";
  if (!chain.rpcUrl) return "RPC endpoint가 없습니다. LCD 조회만 가능합니다.";
  if (!chain.bech32Prefix || !chain.nativeDenom || !chain.bondDenom || !chain.feeDenom || chain.decimals === undefined) return "prefix·denom·decimals 검증 정보가 부족하여 조회만 가능합니다.";
  if (!chain.signing?.some(s => s.wallet === state.walletType && (state.walletType !== "walletconnect" || s.method === "amino"))) return "이 체인·지갑의 서명 방식이 확인되지 않았습니다. 조회만 가능합니다.";
  const profileReason = signingProfileBlockReason(chain);
  if (profileReason) return profileReason;
  const access = chain.rpcAccess;
  if (!access || typeof window === "undefined" || access.origin !== window.location.origin) return "현재 origin의 RPC GET·JSON POST·OPTIONS 접근 근거가 없습니다. 조회만 가능합니다.";
  if (!state.bech32Address) return "현재 체인의 Cosmos 계정이 없습니다. 다시 연결하세요.";
  try { if (bech32.decode(state.bech32Address).prefix !== chain.bech32Prefix) return "계정 prefix가 선택 체인과 다릅니다. 다시 연결하세요."; }
  catch { return "Cosmos 계정 주소가 올바르지 않습니다. 다시 연결하세요."; }
  if (state.walletType === "walletconnect" && (!state.sessionTopic || !state.methods.includes("cosmos_signAmino"))) return "현재 체인의 cosmos_signAmino 승인이 없습니다. 다시 연결하세요.";
  if (!state.pubkey?.length) return "계정 공개키를 확보하지 못했습니다. 지갑/계정을 확인하고 다시 연결하세요.";
  return null;
}

/** Browser JSON POST triggers the real CORS preflight; OPTIONS evidence is separately required per origin. */
export async function verifyChainEndpoints(chain: ChainConfig): Promise<void> {
  if (!chain.chainId || !chain.rpcUrl) throw new Error("chain ID 또는 RPC 설정이 없습니다.");
  const rpc = chain.rpcUrl.replace(/\/$/, "");
  const [lcd, get, post] = await Promise.all([
    verifyLcdChain(chain),
    requestJson<{ result?: { node_info?: { network?: string } } }>(`${rpc}/status`),
    requestJson<{ result?: { node_info?: { network?: string } } }>(rpc, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "status", params: {} }),
    }),
  ]);
  if (lcd !== chain.chainId || get.result?.node_info?.network !== chain.chainId || post.result?.node_info?.network !== chain.chainId) {
    throw new Error("LCD/RPC GET·POST chain ID가 일치하지 않습니다. 서명이 차단되었습니다.");
  }
}
