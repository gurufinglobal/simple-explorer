import type { ChainConfig } from "@/lib/env";
import { ServiceError } from "@/i18n/service-message";
import type { WalletConnectMode } from "@/types/walletconnect";
import { requestJson } from "@/services/clients";
import { assertCosmosWalletKey } from "./signing-profile";
import { getOrCreateSignClient } from "./walletconnect-client";
import { assertWalletConnectRequest } from "./walletconnect-session";

function decodeKey(value: unknown): Uint8Array {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{44}$/.test(value)) throw new ServiceError("wc_public_key_unavailable");
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
/** Keplr wire format verified against @keplr-wallet/wc-client 0.13.41.
 * Keep topic and chain explicit; the upstream adapter selects the last session.
 */
export async function walletConnectPublicKey(chain: ChainConfig, topic: string, address: string, mode: WalletConnectMode, assertCurrent: () => void): Promise<Uint8Array | null> {
  assertCurrent();
  if (mode === "keplr") {
    const client = await getOrCreateSignClient();
    assertCurrent();
    assertWalletConnectRequest(client.session.get(topic), topic, chain, mode, address, "keplr_getKey");
    const key = await client.request<{ bech32Address: string; algo: string; pubKey: string; isNanoLedger?: boolean; isKeystone?: boolean }>({
      topic, chainId: `cosmos:${chain.chainId}`, request: { method: "keplr_getKey", params: { chainId: chain.chainId } },
    });
    assertCurrent();
    assertWalletConnectRequest(client.session.get(topic), topic, chain, mode, address, "keplr_getKey");
    if (!key || key.bech32Address !== address || key.isNanoLedger || key.isKeystone) throw new ServiceError("wc_public_key_unavailable");
    const pubkey = decodeKey(key.pubKey);
    assertCosmosWalletKey(chain, address, pubkey, key.algo);
    return pubkey;
  }
  // Generic Cosmos WC has no standard account-key query. Only accept the exact
  // configured LCD account/key wrapper; never strip an arbitrary wrapper/type.
  const data = await requestJson<{ account?: { '@type'?: string; address?: string; pub_key?: { '@type'?: string; key?: string } | null } }>(
    `${chain.lcdUrl.replace(/\/$/, "")}/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`);
  assertCurrent();
  const account = data.account;
  if (!account?.pub_key) return null;
  if (!chain.signingProfile || account['@type'] !== chain.signingProfile.accountTypeUrl || account.address !== address ||
    account.pub_key['@type'] !== chain.signingProfile.pubkeyTypeUrl) throw new ServiceError("wc_public_key_unavailable");
  const pubkey = decodeKey(account.pub_key.key);
  assertCosmosWalletKey(chain, address, pubkey, "secp256k1");
  return pubkey;
}
