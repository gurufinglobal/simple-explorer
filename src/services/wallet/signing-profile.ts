import { keccak256, ripemd160, Secp256k1, sha256 } from "@cosmjs/crypto";
import { accountFromAny, type AccountParser } from "@cosmjs/stargate";
import { BaseAccount } from "cosmjs-types/cosmos/auth/v1beta1/auth";
import { PubKey } from "cosmjs-types/cosmos/crypto/secp256k1/keys";
import { bech32 } from "bech32";
import type { ChainConfig } from "@/lib/env";

export const COSMOS_ACCOUNT = "/cosmos.auth.v1beta1.BaseAccount";
export const COSMOS_PUBKEY = "/cosmos.crypto.secp256k1.PubKey";
export const GURU_RELEASE_COMMIT = "da4cfbc7652c56ab982a35a85d12c24871558959";
export const GURU_RELEASE_VERSION = `release/v2.1.0@${GURU_RELEASE_COMMIT}`;
export const GURU_RELEASE_PUBKEY = "/cosmos.evm.crypto.v1.ethsecp256k1.PubKey";

/** This release uses the cosmos.evm namespace, unlike the observed older public node. */
export function isGuruReleaseProfile(chain: ChainConfig): boolean {
  const p = chain.signingProfile;
  return chain.chainId === "guru_631-1" && chain.bech32Prefix === "guru" &&
    chain.nativeDenom === "agxn" && chain.bondDenom === "agxn" && chain.feeDenom === "agxn" && chain.decimals === 18 &&
    p?.family === "cosmos-evm" && p.chainVersion === GURU_RELEASE_VERSION &&
    p.accountTypeUrl === COSMOS_ACCOUNT && p.pubkeyTypeUrl === GURU_RELEASE_PUBKEY && p.addressAlgorithm === "ethereum";
}

/** An observed EVM key is never relabelled as Cosmos secp256k1. */
export function signingProfileBlockReason(chain: ChainConfig): string | null {
  const profile = chain.signingProfile;
  if (!profile) return "체인의 계정·공개키·서명 프로필이 확인되지 않았습니다. 조회만 가능합니다.";
  if (isGuruReleaseProfile(chain)) return null;
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
  const bytes = isGuruReleaseProfile(chain) ? keccak256(Secp256k1.uncompressPubkey(pubkey).slice(1)).slice(-20) : ripemd160(sha256(pubkey));
  const derived = bech32.encode(chain.bech32Prefix!, bech32.toWords(bytes));
  if (derived !== address) throw new Error("지갑 공개키에서 도출한 주소가 연결 계정과 다릅니다.");
}

/** Keeps CosmJS's uint64 bounds and rejects unapproved account/key wrappers. Null keys are valid. */
export function signingAccountParser(chain: ChainConfig, expected?: { address: string; pubkey: Uint8Array }): AccountParser {
  assertSigningProfile(chain);
  return account => {
    if (account.typeUrl !== chain.signingProfile!.accountTypeUrl) throw new Error("체인 계정 타입이 서명 프로필과 다릅니다.");
    if (isGuruReleaseProfile(chain)) {
      const base = BaseAccount.decode(account.value);
      if (base.pubKey && base.pubKey.typeUrl !== GURU_RELEASE_PUBKEY) throw new Error("체인 공개키 타입이 릴리스 서명 프로필과 다릅니다.");
      const key = base.pubKey ? PubKey.decode(base.pubKey.value).key : null;
      if (key) assertCosmosWalletKey(chain, base.address, key, "secp256k1");
      if (expected && (base.address !== expected.address || (key &&
        (key.length !== expected.pubkey.length || key.some((b, i) => b !== expected.pubkey[i]))))) {
        throw new Error("체인 계정·공개키가 지갑 계정과 다릅니다.");
      }
      if (base.accountNumber > BigInt(Number.MAX_SAFE_INTEGER) || base.sequence > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("계정 번호·sequence가 안전 정수 범위를 초과했습니다.");
      }
      return { address: base.address, accountNumber: Number(base.accountNumber), sequence: Number(base.sequence),
        pubkey: key ? { type: "os/PubKeyEthSecp256k1", value: btoa(String.fromCharCode(...key)) } : null };
    }
    const parsed = accountFromAny(account);
    if (parsed.pubkey && parsed.pubkey.type !== "tendermint/PubKeySecp256k1") throw new Error("체인 공개키 타입이 서명 프로필과 다릅니다.");
    if (expected && (parsed.address !== expected.address || (parsed.pubkey &&
      parsed.pubkey.value !== btoa(String.fromCharCode(...expected.pubkey))))) {
      throw new Error("체인 계정·공개키가 지갑 계정과 다릅니다.");
    }
    return parsed;
  };
}
