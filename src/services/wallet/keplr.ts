import type { AccountData, DirectSignResponse, OfflineSigner } from "@cosmjs/proto-signing";
import type { AminoSignResponse, StdSignDoc } from "@cosmjs/amino";
import type { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import type { ChainConfig } from "@/lib/env";
import { assertCosmosWalletKey, assertSigningProfile, isGuruReleaseProfile } from "./signing-profile";

export type KeplrAccount = { address: string; pubkey?: Uint8Array; algo?: string };
export type KeplrSigner = {
  getAccounts: () => Promise<readonly KeplrAccount[]>;
  signDirect?: (address: string, doc: SignDoc) => Promise<DirectSignResponse>;
  signAmino?: (address: string, doc: StdSignDoc) => Promise<AminoSignResponse>;
};
export type KeplrKey = {
  bech32Address: string; pubKey: Uint8Array; algo: string;
  isNanoLedger?: boolean; isKeystone?: boolean;
};
export type KeplrChainInfo = ReturnType<typeof buildKeplrChainInfo>;

/** Registration is opt-in and requires explicit derivation and currency evidence. */
export function buildKeplrChainInfo(chain: ChainConfig) {
  assertSigningProfile(chain);
  const registration = chain.keplrRegistration;
  if (!registration || !chain.chainId || !chain.rpcUrl || !chain.bech32Prefix || chain.decimals === undefined ||
    !chain.nativeDenom || chain.nativeDenom !== chain.bondDenom || chain.nativeDenom !== chain.feeDenom ||
    registration.bech32Config.bech32PrefixAccAddr !== chain.bech32Prefix) {
    throw new Error("Keplr 등록을 위한 coin type·prefix·단일 자산 정보가 확인되지 않았습니다.");
  }
  const step = registration.gasPriceStep;
  if (isGuruReleaseProfile(chain) && (registration.coinType !== 60 ||
    registration.bech32Config.bech32PrefixAccPub !== "gurupub" ||
    registration.bech32Config.bech32PrefixValAddr !== "guruvaloper" ||
    registration.bech32Config.bech32PrefixValPub !== "guruvaloperpub" ||
    registration.bech32Config.bech32PrefixConsAddr !== "guruvalcons" ||
    registration.bech32Config.bech32PrefixConsPub !== "guruvalconspub")) {
    throw new Error("Keplr coin type·prefix가 Guru 릴리스 소스와 다릅니다.");
  }
  if (step.low > step.average || step.average > step.high) throw new Error("Keplr 수수료 가격 순서가 올바르지 않습니다.");
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
  if (!keplr) throw new Error("Keplr 지갑을 찾을 수 없습니다.");
  assertCurrent();
  if (register && chain.keplrRegistration) {
    const info = buildKeplrChainInfo(chain);
    if (!keplr.experimentalSuggestChain) throw new Error("현재 Keplr는 체인 등록 API를 제공하지 않습니다.");
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
  if (!signer) throw new Error("Keplr signer를 찾을 수 없습니다.");
  return signer;
}

export async function readKeplrAccounts(signer: KeplrSigner, chain: ChainConfig, assertCurrent: () => void, forSigning = false) {
  assertCurrent();
  const accounts = await signer.getAccounts();
  assertCurrent();
  if (accounts.length !== 1 || !accounts[0].address) throw new Error("Keplr에서 하나의 계정을 선택하고 다시 연결하세요.");
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
    if (!algorithmsMatch) throw new Error("Keplr signer·wallet key 알고리즘이 체인 서명 프로필과 다릅니다.");
    if (key.bech32Address !== account.address ||
      (account.pubkey?.length && (account.pubkey.length !== key.pubKey.length || account.pubkey.some((v, i) => v !== key.pubKey[i])))) {
      throw new Error("Keplr signer와 wallet key의 계정·공개키가 다릅니다.");
    }
    if (forSigning && (key.isNanoLedger || key.isKeystone)) throw new Error("이 하드웨어 계정의 서명은 아직 검증되지 않았습니다.");
    account.pubkey = key.pubKey.slice();
    if (!guru) account.algo = key.algo;
    if (guru) assertCosmosWalletKey(chain, account.address, account.pubkey, account.algo!);
  }
  if (forSigning) {
    if (!account.pubkey || !account.algo) throw new Error("지갑 공개키·알고리즘을 확인하지 못했습니다.");
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
      if (account.algo !== "secp256k1" || !account.pubkey) throw new Error("지원하지 않는 signer 공개키입니다.");
      return { address: account.address, algo: account.algo, pubkey: account.pubkey.slice() };
    });
  };
  if (signer.signDirect) return { getAccounts, signDirect: (who, doc) => signer.signDirect!(who, doc) };
  if (signer.signAmino) return { getAccounts, signAmino: (who, doc) => signer.signAmino!(who, doc) };
  throw new Error("Keplr signer에 지원하는 서명 메서드가 없습니다.");
}
