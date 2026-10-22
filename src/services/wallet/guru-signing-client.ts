import { makeSignDoc as makeAminoSignDoc, serializeSignDoc, type StdFee, type StdSignature } from "@cosmjs/amino";
import { keccak256, Secp256k1, Secp256k1Signature } from "@cosmjs/crypto";
import { isOfflineDirectSigner, type EncodeObject, type OfflineSigner } from "@cosmjs/proto-signing";
import { AminoTypes, createDefaultAminoConverters, createProtobufRpcClient, SigningStargateClient,
  type SignerData, type SigningStargateClientOptions } from "@cosmjs/stargate";
import { connectComet, type CometClient } from "@cosmjs/tendermint-rpc";
import { PubKey } from "cosmjs-types/cosmos/crypto/secp256k1/keys";
import { AuthInfo, SignDoc, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { ServiceClientImpl } from "cosmjs-types/cosmos/tx/v1beta1/service";
import type { ChainConfig } from "@/lib/env";
import { assertCosmosWalletKey, GURU_RELEASE_PUBKEY, isGuruReleaseProfile, signingAccountParser } from "./signing-profile";

const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const decode64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const uint64 = (n: string | number | bigint) => {
  if ((typeof n === "number" && !Number.isSafeInteger(n)) || !/^\d+$/.test(String(n))) throw new Error("잘못된 uint64 값입니다.");
  const value = BigInt(n);
  if (value > BigInt("18446744073709551615")) throw new Error("uint64 범위를 초과했습니다.");
  return value;
};

/** Release v2.1.0 MsgSend only. Network and wallet remain behind the existing preparation guards. */
export class GuruSigningClient extends SigningStargateClient {
  private readonly guruAmino = new AminoTypes(createDefaultAminoConverters());

  static async connectGuru(endpoint: string, signer: OfflineSigner, chain: ChainConfig, options: SigningStargateClientOptions = {}) {
    return new GuruSigningClient(await connectComet(endpoint), signer, chain, options);
  }

  constructor(comet: CometClient | undefined, private readonly guruSigner: OfflineSigner,
    private readonly chain: ChainConfig, options: SigningStargateClientOptions = {}) {
    if (!isGuruReleaseProfile(chain)) throw new Error("검증된 Guru 릴리스 프로필이 아닙니다.");
    super(comet, guruSigner, { ...options, accountParser: options.accountParser ?? signingAccountParser(chain) });
  }

  private async walletKey(address: string) {
    const account = (await this.guruSigner.getAccounts()).find(a => a.address === address);
    if (!account) throw new Error("실제 signer 계정이 없습니다.");
    // Keplr reports the curve as secp256k1 for this API. The profile, address and
    // verified Keccak signature determine its semantics; never cast an algo.
    assertCosmosWalletKey(this.chain, address, account.pubkey, account.algo);
    return account.pubkey;
  }

  private body(address: string, messages: readonly EncodeObject[], memo: string, timeoutHeight?: bigint) {
    if (messages.length !== 1 || messages[0].typeUrl !== "/cosmos.bank.v1beta1.MsgSend") {
      throw new Error("Guru 릴리스 어댑터는 단일 MsgSend만 지원합니다.");
    }
    if (messages[0].value.fromAddress !== address) throw new Error("MsgSend 송신 계정이 signer와 다릅니다.");
    return this.registry.encode({ typeUrl: "/cosmos.tx.v1beta1.TxBody", value: { messages, memo, timeoutHeight } });
  }

  private auth(key: Uint8Array, sequence: number, fee: StdFee, mode: number) {
    return AuthInfo.encode(AuthInfo.fromPartial({
      signerInfos: [{ publicKey: { typeUrl: GURU_RELEASE_PUBKEY, value: PubKey.encode({ key }).finish() },
        modeInfo: { single: { mode } }, sequence: uint64(sequence) }],
      fee: { amount: [...fee.amount], gasLimit: uint64(fee.gas), payer: fee.payer, granter: fee.granter },
    })).finish();
  }

  private async checkedSignature(response: StdSignature, bytes: Uint8Array, key: Uint8Array) {
    // Keplr's response envelope is tendermint/PubKeySecp256k1 even for eth signing.
    // The on-chain Any is constructed independently from the pinned proto above.
    if (response.pub_key.type !== "tendermint/PubKeySecp256k1" || !equal(decode64(response.pub_key.value), key)) {
      throw new Error("지갑 서명 공개키가 확인한 키와 다릅니다.");
    }
    const signature = decode64(response.signature);
    if (signature.length !== 64 && signature.length !== 65) throw new Error("잘못된 Guru 서명 길이입니다.");
    const compact = signature.slice(0, 64);
    // go-ethereum verification rejects high S. Preserve that rule explicitly.
    const s = BigInt(`0x${Array.from(compact.slice(32), b => b.toString(16).padStart(2, "0")).join("")}`);
    if (s > BigInt("0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0") ||
      !await Secp256k1.verifySignature(Secp256k1Signature.fromFixedLength(compact), keccak256(bytes), key)) {
      throw new Error("Guru Keccak 서명 검증에 실패했습니다. 방송하지 않습니다.");
    }
    return signature;
  }

  override async simulate(address: string, messages: readonly EncodeObject[], memo: string | undefined): Promise<number> {
    const key = await this.walletKey(address);
    const bodyBytes = this.body(address, messages, memo ?? "");
    const { sequence } = await this.getSequence(address);
    const txBytes = TxRaw.encode({ bodyBytes,
      authInfoBytes: this.auth(key, sequence, { amount: [], gas: "0" }, 1), signatures: [new Uint8Array(64)] }).finish();
    const result = await new ServiceClientImpl(createProtobufRpcClient(this.forceGetQueryClient())).Simulate({ txBytes });
    const gas = result.gasInfo?.gasUsed;
    if (gas === undefined || gas <= BigInt(0) || gas > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("유효한 simulate gas를 받지 못했습니다.");
    return Number(gas);
  }

  override async sign(address: string, messages: readonly EncodeObject[], fee: StdFee, memo: string,
    explicitSignerData?: SignerData, timeoutHeight?: bigint): Promise<TxRaw> {
    const key = await this.walletKey(address);
    const bodyBytes = this.body(address, messages, memo, timeoutHeight);
    const data = explicitSignerData ?? { ...await this.getSequence(address), chainId: await this.getChainId() };
    if (data.chainId !== this.chain.chainId) throw new Error("서명 체인이 릴리스 프로필과 다릅니다.");
    if (isOfflineDirectSigner(this.guruSigner)) {
      if (!this.chain.signingProfile!.signModes.includes("direct")) throw new Error("Direct 서명이 허용되지 않았습니다.");
      const doc = SignDoc.fromPartial({ bodyBytes, authInfoBytes: this.auth(key, data.sequence, fee, 1),
        chainId: data.chainId, accountNumber: uint64(data.accountNumber) });
      const bytes = SignDoc.encode(doc).finish();
      const response = await this.guruSigner.signDirect(address, doc);
      if (!equal(SignDoc.encode(response.signed).finish(), bytes)) throw new Error("지갑이 확인한 SignDoc을 변경했습니다. 다시 확인하세요.");
      const signature = await this.checkedSignature(response.signature, bytes, key);
      // Decode the saved bytes so mutations to the wallet request cannot leak into TxRaw.
      const signed = SignDoc.decode(bytes);
      return { bodyBytes: signed.bodyBytes, authInfoBytes: signed.authInfoBytes, signatures: [signature] };
    }
    if (!this.chain.signingProfile!.signModes.includes("amino")) throw new Error("Amino 서명이 허용되지 않았습니다.");
    const doc = makeAminoSignDoc(messages.map(m => this.guruAmino.toAmino(m)), fee,
      data.chainId, memo, data.accountNumber, data.sequence, timeoutHeight);
    const bytes = serializeSignDoc(doc);
    const authInfoBytes = this.auth(key, data.sequence, fee, 127);
    const response = await this.guruSigner.signAmino(address, doc);
    if (!equal(serializeSignDoc(response.signed), bytes)) throw new Error("지갑이 확인한 Amino SignDoc을 변경했습니다. 다시 확인하세요.");
    return { bodyBytes, authInfoBytes, signatures: [await this.checkedSignature(response.signature, bytes, key)] };
  }
}
