
import { ServiceError } from '@/i18n/service-message';
import type { AccountData, DirectSignResponse, OfflineSigner } from "@cosmjs/proto-signing";
import type { AminoSignResponse, StdSignDoc } from "@cosmjs/amino";
import type { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import type { ChainConfig } from "@/lib/env";
import { assertCosmosWalletKey, assertSigningProfile, isGuruReleaseProfile } from "./signing-profile";

export type KeplrAccount = { address: string; pubkey?: Uint8Array; algo?: string };
type KeplrDirectResponse = Omit<DirectSignResponse, "signed"> & {
  signed: Omit<SignDoc, "accountNumber"> & {
    accountNumber: bigint | { low: number; high: number; unsigned: boolean };
  };
};
export type KeplrSigner = {
  getAccounts: () => Promise<readonly KeplrAccount[]>;
  signDirect?: (address: string, doc: SignDoc) => Promise<KeplrDirectResponse>;
  signAmino?: (address: string, doc: StdSignDoc) => Promise<AminoSignResponse>;
};
export type KeplrKey = {
  bech32Address: string; pubKey: Uint8Array; algo: string;
  isNanoLedger?: boolean; isKeystone?: boolean;
};
export type KeplrChainInfo = ReturnType<typeof buildKeplrChainInfo>;

/** Keplr 0.13.53 returns protobuf Long; current CosmJS uses bigint. */
function keplrAccountNumber(value: KeplrDirectResponse["signed"]["accountNumber"]): bigint {
  if (typeof value === "bigint") {
    if (value >= BigInt(0) && value <= BigInt("18446744073709551615")) return value;
  } else if (value && typeof value === "object" && typeof value.unsigned === "boolean" &&
    [value.low, value.high].every(word => Number.isInteger(word) && word >= -2147483648 && word <= 2147483647) &&
    (value.unsigned || value.high >= 0)) {
    return (BigInt(value.high >>> 0) << BigInt(32)) | BigInt(value.low >>> 0);
  }
  throw new ServiceError("keplr_returned_an_invalid_signing_account_number");
}

/** Registration is opt-in and requires explicit derivation and currency evidence. */
export function buildKeplrChainInfo(chain: ChainConfig) {
  assertSigningProfile(chain);
  const registration = chain.keplrRegistration;
  if (!registration || !chain.chainId || !chain.rpcUrl || !chain.bech32Prefix || chain.decimals === undefined ||
    !chain.nativeDenom || chain.nativeDenom !== chain.bondDenom || chain.nativeDenom !== chain.feeDenom ||
    registration.bech32Config.bech32PrefixAccAddr !== chain.bech32Prefix) {
    throw new ServiceError("coin_type_prefix_or_single_asset_information_for_keplr_registration");
  }
  const step = registration.gasPriceStep;
  if (isGuruReleaseProfile(chain) && (registration.coinType !== 60 ||
    registration.bech32Config.bech32PrefixAccPub !== "gurupub" ||
    registration.bech32Config.bech32PrefixValAddr !== "guruvaloper" ||
    registration.bech32Config.bech32PrefixValPub !== "guruvaloperpub" ||
    registration.bech32Config.bech32PrefixConsAddr !== "guruvalcons" ||
    registration.bech32Config.bech32PrefixConsPub !== "guruvalconspub")) {
    throw new ServiceError("keplr_coin_type_or_prefix_differs_from_the_guru_release");
  }
  if (step.low > step.average || step.average > step.high) throw new ServiceError("invalid_keplr_fee_price_ordering");
  const currency = { coinDenom: registration.currency, coinMinimalDenom: chain.nativeDenom, coinDecimals: chain.decimals };
  return {
    chainId: chain.chainId, chainName: chain.name, rpc: chain.rpcUrl, rest: chain.lcdUrl,
    bip44: { coinType: registration.coinType }, bech32Config: { ...registration.bech32Config },
    currencies: [currency], stakeCurrency: currency, feeCurrencies: [{ ...currency, gasPriceStep: { ...step } }],
    features: isGuruReleaseProfile(chain) ? ["eth-address-gen", "eth-key-sign", "eth-secp256k1-cosmos"] : [] as string[],
  };
}

export async function getKeplrSigner(chain: ChainConfig, assertCurrent: () => void, register = false): Promise<KeplrSigner> {
  const keplr = window.keplr;
  if (!keplr) throw new ServiceError("keplr_wallet_not_found");
  assertCurrent();
  if (register && chain.keplrRegistration) {
    const info = buildKeplrChainInfo(chain);
    if (!keplr.experimentalSuggestChain) throw new ServiceError("this_keplr_version_does_not_provide_the_chain_registration_api");
    await keplr.experimentalSuggestChain(info);
    assertCurrent();
  }
  await keplr.enable(chain.chainId!);
  assertCurrent();
  // Bind extension methods to their owner. Never fall back after a rejection.
  const signer = keplr.getOfflineSignerAuto ? await keplr.getOfflineSignerAuto(chain.chainId!)
    : window.getOfflineSignerAuto ? await window.getOfflineSignerAuto(chain.chainId!)
    : keplr.getOfflineSigner ? keplr.getOfflineSigner(chain.chainId!)
    : window.getOfflineSigner?.(chain.chainId!);
  assertCurrent();
  if (!signer) throw new ServiceError("keplr_signer_not_found");
  return signer;
}

export async function readKeplrAccounts(signer: KeplrSigner, chain: ChainConfig, assertCurrent: () => void, forSigning = false) {
  assertCurrent();
  const accounts = await signer.getAccounts();
  assertCurrent();
  if (accounts.length !== 1 || !accounts[0].address) throw new ServiceError("select_one_account_in_keplr_and_reconnect");
  const account = { ...accounts[0] };
  // Wallet key is authoritative even when LCD pub_key is null for a first-use account.
  if (window.keplr?.getKey) {
    const key = await window.keplr.getKey(chain.chainId!);
    assertCurrent();
    // Keplr 0.13.53 exposes Ethereum signing semantics in getKey, while its
    // CosmJS signer reports the underlying curve. Validate both declarations;
    // never relabel an unknown signer algorithm to satisfy CosmJS.
    const guru = isGuruReleaseProfile(chain);
    const algorithmsMatch = guru
      ? account.algo === "secp256k1" && key.algo === "ethsecp256k1"
      : !account.algo || account.algo === key.algo;
    if (!algorithmsMatch) throw new ServiceError("keplr_signer_or_wallet_key_algorithm_differs_from_the_chain");
    if (key.bech32Address !== account.address ||
      (account.pubkey?.length && (account.pubkey.length !== key.pubKey.length || account.pubkey.some((v, i) => v !== key.pubKey[i])))) {
      throw new ServiceError("keplr_signer_and_wallet_key_account_or_public_key_do");
    }
    if (forSigning && (key.isNanoLedger || key.isKeystone)) throw new ServiceError("signing_with_this_hardware_account_is_not_verified_yet");
    account.pubkey = key.pubKey.slice();
    if (!guru) account.algo = key.algo;
    if (guru) assertCosmosWalletKey(chain, account.address, account.pubkey, account.algo!);
  }
  if (forSigning) {
    if (!account.pubkey || !account.algo) throw new ServiceError("could_not_verify_the_wallet_public_key_or_algorithm");
    assertCosmosWalletKey(chain, account.address, account.pubkey, account.algo);
  }
  return [account];
}

/** Runtime validation, not a cast from an EVM algorithm into CosmJS's account type. */
export function cosmosKeplrSigner(signer: KeplrSigner, chain: ChainConfig, assertCurrent: () => void): OfflineSigner {
  assertSigningProfile(chain);
  const getAccounts = async (): Promise<readonly AccountData[]> => {
    const accounts = await readKeplrAccounts(signer, chain, assertCurrent, true);
    return accounts.map((account): AccountData => {
      if (account.algo !== "secp256k1" || !account.pubkey) throw new ServiceError("unsupported_signer_public_key");
      return { address: account.address, algo: account.algo, pubkey: account.pubkey.slice() };
    });
  };
  if (signer.signDirect) return { getAccounts, signDirect: async (who, doc) => {
    const response = await signer.signDirect!(who, doc);
    return { ...response, signed: { ...response.signed, accountNumber: keplrAccountNumber(response.signed.accountNumber) } };
  } };
  if (signer.signAmino) return { getAccounts, signAmino: (who, doc) => signer.signAmino!(who, doc) };
  throw new ServiceError("keplr_signer_has_no_supported_signing_method");
}
