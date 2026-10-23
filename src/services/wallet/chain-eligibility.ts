
import { ServiceError, serviceText } from '@/i18n/service-message';
import { bech32 } from "bech32";
import type { ChainConfig } from "@/lib/env";
import { requestJson } from "@/services/clients";
import type { WalletSessionState } from "@/stores/wallet-session.store";
import { GURU_RELEASE_COMMIT, isGuruReleaseProfile, signingProfileBlockReason } from "./signing-profile";

export async function verifyLcdChain(chain: ChainConfig): Promise<string> {
  const response = await requestJson<{ default_node_info?: { network?: string }; application_version?: { git_commit?: string } }>(`${chain.lcdUrl.replace(/\/$/, "")}/cosmos/base/tendermint/v1beta1/node_info`);
  const chainId = response.default_node_info?.network;
  if (!chainId || (chain.chainId && chain.chainId !== chainId)) throw new ServiceError("lcd_chain_id_differs_from_the_selected_chain_configuration");
  if (isGuruReleaseProfile(chain) && response.application_version?.git_commit !== GURU_RELEASE_COMMIT) {
    throw new ServiceError("node_source_commit_differs_from_the_verified_guru_release_signing");
  }
  return chainId;
}

export function writeBlockReason(chain: ChainConfig, state: WalletSessionState): string | null {
  if (state.status !== "connected") return serviceText("read_only_connect_your_wallet");
  if (state.chainKey !== chain.key || !chain.chainId || state.chainId !== chain.chainId) return serviceText("chain_and_wallet_connection_do_not_match_reconnect");
  if (state.wcMode === "evm") return serviceText("wc_evm_cosmos_read_only");
  if (state.walletType === "metamask") return serviceText("metamask_is_read_only_for_cosmos_reconnect_with_keplr_or");
  if (!chain.rpcUrl) return serviceText("rpc_endpoint_missing_only_lcd_queries_are_available");
  if (!chain.bech32Prefix || !chain.nativeDenom || !chain.bondDenom || !chain.feeDenom || chain.decimals === undefined) return serviceText("prefix_denom_or_decimals_verification_is_incomplete_read_only");
  if (!chain.signing?.some(s => s.wallet === state.walletType && (state.walletType !== "walletconnect" || s.method === "amino"))) return serviceText("signing_for_this_chain_and_wallet_is_unverified_read_only");
  const profileReason = signingProfileBlockReason(chain);
  if (profileReason) return profileReason;
  if (isGuruReleaseProfile(chain) && state.walletType !== "keplr") return serviceText("the_guru_release_adapter_is_only_verified_for_keplr_software");
  const access = chain.rpcAccess;
  if (!access || typeof window === "undefined" || access.origin !== window.location.origin) return serviceText("no_verified_rpc_get_json_post_and_options_access_from");
  if (!state.bech32Address) return serviceText("no_cosmos_account_for_the_current_chain_reconnect");
  try { if (bech32.decode(state.bech32Address).prefix !== chain.bech32Prefix) return serviceText("account_prefix_differs_from_the_selected_chain_reconnect"); }
  catch { return serviceText("invalid_cosmos_account_address_reconnect"); }
  if (state.walletType === "walletconnect" && (!state.sessionTopic || !state.methods.includes(state.wcMode === "keplr" ? "keplr_signAmino" : "cosmos_signAmino"))) return serviceText("wc_request_not_approved");
  if (state.walletType === "walletconnect" && !state.pubkey?.length) return serviceText("wc_public_key_unavailable");
  if (!state.pubkey?.length) return serviceText("could_not_obtain_the_account_public_key_check_the_wallet");
  return null;
}

/** Browser JSON POST triggers the real CORS preflight; OPTIONS evidence is separately required per origin. */
export async function verifyChainEndpoints(chain: ChainConfig): Promise<void> {
  if (!chain.chainId || !chain.rpcUrl) throw new ServiceError("chain_id_or_rpc_configuration_missing");
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
    throw new ServiceError("lcd_and_rpc_get_post_chain_ids_do_not_match");
  }
}
