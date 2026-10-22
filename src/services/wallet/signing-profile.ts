import { ripemd160, Secp256k1, sha256 } from "@cosmjs/crypto";
import { accountFromAny, type AccountParser } from "@cosmjs/stargate";
import { bech32 } from "bech32";
import type { ChainConfig } from "@/lib/env";

export const COSMOS_ACCOUNT = "/cosmos.auth.v1beta1.BaseAccount";
export const COSMOS_PUBKEY = "/cosmos.crypto.secp256k1.PubKey";

/** An observed EVM key is never relabelled as Cosmos secp256k1. */
export function signingProfileBlockReason(chain: ChainConfig): string | null {
  const profile = chain.signingProfile;
  if (!profile) return "체인의 계정·공개키·서명 프로필이 확인되지 않았습니다. 조회만 가능합니다.";
  // W01 observed a custom Guru key on this chain, irrespective of a user-supplied label.
  if (chain.chainId === "guru_631-1" || profile.family !== "cosmos") {
    return "이 EVM 체인의 공개키 codec·서명 호환성이 검증되지 않았습니다. 조회만 가능합니다.";
  }
  if (profile.accountTypeUrl !== COSMOS_ACCOUNT || profile.pubkeyTypeUrl !== COSMOS_PUBKEY || profile.addressAlgorithm !== "cosmos") {
    return "이 계정·공개키 codec은 지원하지 않습니다. 조회만 가능합니다.";
  }
  return null;
}

export function assertSigningProfile(chain: ChainConfig): void {
  const reason = signingProfileBlockReason(chain);
  if (reason) throw new Error(reason);
}

export function assertCosmosWalletKey(chain: ChainConfig, address: string, pubkey: Uint8Array, algo: string): void {
  assertSigningProfile(chain);
  if (algo !== "secp256k1" || pubkey.length !== 33 || (pubkey[0] !== 2 && pubkey[0] !== 3)) {
    throw new Error("지갑 공개키 알고리즘·길이가 체인 서명 프로필과 다릅니다.");
  }
  // Validate the curve point as well as its encoding before address derivation.
  Secp256k1.uncompressPubkey(pubkey);
  const derived = bech32.encode(chain.bech32Prefix!, bech32.toWords(ripemd160(sha256(pubkey))));
  if (derived !== address) throw new Error("지갑 공개키에서 도출한 주소가 연결 계정과 다릅니다.");
}

/** Keeps CosmJS's uint64 bounds and rejects unapproved account/key wrappers. Null keys are valid. */
export function signingAccountParser(chain: ChainConfig, expected?: { address: string; pubkey: Uint8Array }): AccountParser {
  assertSigningProfile(chain);
  return account => {
    if (account.typeUrl !== chain.signingProfile!.accountTypeUrl) throw new Error("체인 계정 타입이 서명 프로필과 다릅니다.");
    const parsed = accountFromAny(account);
    if (parsed.pubkey && parsed.pubkey.type !== "tendermint/PubKeySecp256k1") throw new Error("체인 공개키 타입이 서명 프로필과 다릅니다.");
    if (expected && (parsed.address !== expected.address || (parsed.pubkey &&
      parsed.pubkey.value !== btoa(String.fromCharCode(...expected.pubkey))))) {
      throw new Error("체인 계정·공개키가 지갑 계정과 다릅니다.");
    }
    return parsed;
  };
}
