
import { serviceText, ServiceError } from '@/i18n/service-message';
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
  if (!profile) return serviceText("chain_account_public_key_or_signing_profile_is_unverified_read");
  if (isGuruReleaseProfile(chain)) return null;
  // W01 observed a custom Guru key on this chain, irrespective of a user-supplied label.
  if (chain.chainId === "guru_631-1" || profile.family !== "cosmos") {
    return serviceText("public_key_codec_and_signing_compatibility_for_this_evm_chain");
  }
  if (profile.accountTypeUrl !== COSMOS_ACCOUNT || profile.pubkeyTypeUrl !== COSMOS_PUBKEY || profile.addressAlgorithm !== "cosmos") {
    return serviceText("this_account_or_public_key_codec_is_unsupported_read_only");
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
    throw new ServiceError("wallet_public_key_algorithm_or_length_differs_from_the_chain");
  }
  // Validate the curve point as well as its encoding before address derivation.
  Secp256k1.uncompressPubkey(pubkey);
  const bytes = isGuruReleaseProfile(chain) ? keccak256(Secp256k1.uncompressPubkey(pubkey).slice(1)).slice(-20) : ripemd160(sha256(pubkey));
  const derived = bech32.encode(chain.bech32Prefix!, bech32.toWords(bytes));
  if (derived !== address) throw new ServiceError("address_derived_from_the_wallet_public_key_differs_from_the");
}

/** Keeps CosmJS's uint64 bounds and rejects unapproved account/key wrappers. Null keys are valid. */
export function signingAccountParser(chain: ChainConfig, expected?: { address: string; pubkey: Uint8Array }): AccountParser {
  assertSigningProfile(chain);
  return account => {
    if (account.typeUrl !== chain.signingProfile!.accountTypeUrl) throw new ServiceError("chain_account_type_differs_from_the_signing_profile");
    if (isGuruReleaseProfile(chain)) {
      const base = BaseAccount.decode(account.value);
      if (base.pubKey && base.pubKey.typeUrl !== GURU_RELEASE_PUBKEY) throw new ServiceError("chain_public_key_type_differs_from_the_release_signing_profile");
      const key = base.pubKey ? PubKey.decode(base.pubKey.value).key : null;
      if (key) assertCosmosWalletKey(chain, base.address, key, "secp256k1");
      if (expected && (base.address !== expected.address || (key &&
        (key.length !== expected.pubkey.length || key.some((b, i) => b !== expected.pubkey[i]))))) {
        throw new ServiceError("chain_account_or_public_key_differs_from_the_wallet_account");
      }
      if (base.accountNumber > BigInt(Number.MAX_SAFE_INTEGER) || base.sequence > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new ServiceError("account_number_or_sequence_exceeds_the_safe_integer_range");
      }
      return { address: base.address, accountNumber: Number(base.accountNumber), sequence: Number(base.sequence),
        pubkey: key ? { type: "os/PubKeyEthSecp256k1", value: btoa(String.fromCharCode(...key)) } : null };
    }
    const parsed = accountFromAny(account);
    if (parsed.pubkey && parsed.pubkey.type !== "tendermint/PubKeySecp256k1") throw new ServiceError("chain_public_key_type_differs_from_the_signing_profile");
    if (expected && (parsed.address !== expected.address || (parsed.pubkey &&
      parsed.pubkey.value !== btoa(String.fromCharCode(...expected.pubkey))))) {
      throw new ServiceError("chain_account_or_public_key_differs_from_the_wallet_account");
    }
    return parsed;
  };
}
