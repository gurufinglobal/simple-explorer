// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountFromAny } from '@cosmjs/stargate';
import type { CometClient } from '@cosmjs/tendermint-rpc';
import { sha256, keccak256, Secp256k1 } from '@cosmjs/crypto';
import { BaseAccount } from 'cosmjs-types/cosmos/auth/v1beta1/auth';
import { QueryAccountResponse } from 'cosmjs-types/cosmos/auth/v1beta1/query';
import { PubKey } from 'cosmjs-types/cosmos/crypto/secp256k1/keys';
import { SimulateRequest, SimulateResponse } from 'cosmjs-types/cosmos/tx/v1beta1/service';
import { AuthInfo, SignDoc, TxBody, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { MsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import { type ChainConfig } from '@/lib/env';
import { connectWallet } from '@/services/wallet/wallet-connector';
import { buildKeplrChainInfo, type KeplrSigner } from '@/services/wallet/keplr';
import { signingAccountParser, signingProfileBlockReason } from '@/services/wallet/signing-profile';
import { prepareSendTx, submitSendTx } from '@/services/guru/bank-tx.client';
import { useWalletSessionStore as store } from '@/stores/wallet-session.store';
import { GURU_RELEASE_COMMIT, GURU_RELEASE_VERSION, GURU_RELEASE_PUBKEY, COSMOS_ACCOUNT } from '@/services/wallet/signing-profile';
import { GuruSigningClient } from '@/services/wallet/guru-signing-client';
import { serializeSignDoc } from '@cosmjs/amino';
import { fromHex } from '@cosmjs/encoding';
import goVectors from '../fixtures/guru-release/vectors.json';
// Published test scalar 1, never an account used on any network.
const testScalar = fromHex('0000000000000000000000000000000000000000000000000000000000000001');
const pubkey = fromHex('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
const sender = bech32.encode('guru', bech32.toWords(fromHex('7e5f4552091a69125d5dfcb7b8c2659029395bdf')));
const cosmosSigningProfile = { family: 'cosmos-evm' as const, chainVersion: GURU_RELEASE_VERSION,
  accountTypeUrl: COSMOS_ACCOUNT, pubkeyTypeUrl: GURU_RELEASE_PUBKEY, addressAlgorithm: 'ethereum' as const,
  signModes: ['direct', 'amino'] as ('direct' | 'amino')[], evidence: 'release source and isolated test only' };
import { bech32 } from 'bech32';

const recipient = bech32.encode('guru', bech32.toWords(new Uint8Array(20).fill(2)));
const chain: ChainConfig = {
  key: 'codec', name: 'Synthetic Cosmos', chainId: 'guru_631-1', lcdUrl: 'https://lcd.test', rpcUrl: 'https://rpc.test',
  bech32Prefix: 'guru', nativeDenom: 'agxn', bondDenom: 'agxn', feeDenom: 'agxn', decimals: 18,
  signingProfile: cosmosSigningProfile,
  signing: ['direct', 'amino'].map(method => ({ wallet: 'keplr' as const, method: method as 'direct' | 'amino', evidence: 'synthetic only' })),
  rpcAccess: { origin: 'http://localhost:3000', get: true, post: true, options: true, observedAt: '2026-10-22', evidence: 'synthetic only' },
  sendFeePolicy: { mode: 'simulate', gasPrice: '0.001agxn', gasMultiplierBps: 13000, evidence: 'synthetic only' },
};
const input = { walletType: 'keplr' as const, sessionTopic: null, bech32Address: sender, toAddress: recipient, amount: '1', denom: 'agxn' };
const signatureEnvelope = { pub_key: { type: 'tendermint/PubKeySecp256k1', value: Buffer.from(pubkey).toString('base64') }, signature: Buffer.from(new Uint8Array(64)).toString('base64') };
async function signBytes(bytes: Uint8Array, digest = keccak256) {
  const sig = await Secp256k1.createSignature(digest(bytes), testScalar);
  return { ...signatureEnvelope, signature: Buffer.from(sig.toFixedLength().slice(0, 64)).toString('base64') };
}
let nodeCommit: string | undefined;
let wallet: KeplrSigner;
let signedDoc: SignDoc | undefined;
let simulated: TxRaw | undefined;
let broadcastBytes: Uint8Array;
let accountKeyType: string | null;
let sequence: bigint;
let broadcast: ReturnType<typeof vi.fn>;
let accountQuery: ReturnType<typeof vi.fn>;
function configure(overrides: Partial<ChainConfig> = {}) {
  vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ ...chain, ...overrides }]));
  vi.stubEnv('NEXT_PUBLIC_DEFAULT_CHAIN_KEY', chain.key);
}
function accountAny(keyType: string | null = accountKeyType) {
  return { typeUrl: cosmosSigningProfile.accountTypeUrl, value: BaseAccount.encode(BaseAccount.fromPartial({
    address: sender, accountNumber: BigInt('7'), sequence,
    pubKey: keyType ? { typeUrl: keyType, value: PubKey.encode({ key: pubkey }).finish() } : undefined,
  })).finish() };
}
beforeEach(() => {
  nodeCommit = GURU_RELEASE_COMMIT; configure(); document.cookie = 'gf_chain=; max-age=0; path=/'; localStorage.clear(); store.getState().disconnect();
  store.getState().connect('keplr', sender, null, { chainKey: chain.key, chainId: chain.chainId!, pubkey });
  signedDoc = undefined; simulated = undefined; broadcastBytes = new Uint8Array(); accountKeyType = null; sequence = BigInt('0');
  wallet = { getAccounts: vi.fn(async () => [{ address: sender, pubkey, algo: 'secp256k1' }]),
    signDirect: vi.fn(async (_who, doc) => { signedDoc = doc; return { signed: doc, signature: await signBytes(SignDoc.encode(doc).finish()) }; }) };
  window.keplr = { enable: vi.fn(async () => {}), getOfflineSignerAuto: vi.fn(async () => wallet),
    getKey: vi.fn(async () => ({ bech32Address: sender, pubKey: pubkey, algo: 'secp256k1' })) };
  window.getOfflineSigner = vi.fn(() => { throw new Error('Auto signer must take priority'); });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('node_info')) return Response.json({ default_node_info: { network: chain.chainId }, application_version: { git_commit: nodeCommit } });
    if (url.startsWith(chain.rpcUrl!)) return Response.json({ result: { node_info: { network: chain.chainId } } });
    if (url.includes('denoms_metadata')) return Response.json({ metadatas: [{ base: 'agxn', display: 'TEST', symbol: 'TEST', denom_units: [{ denom: 'agxn', exponent: 0 }, { denom: 'TEST', exponent: 18 }] }] });
    if (url.includes('/balances/')) return Response.json({ balances: [{ denom: 'agxn', amount: '1000000000000000000000000' }] });
    throw new Error(`Unexpected LCD query ${url}`);
  }));
  accountQuery = vi.fn(() => accountAny());
  broadcast = vi.fn(async ({ tx }: { tx: Uint8Array }) => { broadcastBytes = tx; return { code: 0, hash: sha256(tx) }; });
  // Only network transport is mocked. CosmJS parser, simulate, SignDoc, TxRaw and receipt polling run unchanged.
  const comet = {
    status: async () => ({ nodeInfo: { network: chain.chainId } }), disconnect: vi.fn(), broadcastTxSync: broadcast,
    abciQuery: async ({ path, data }: { path: string; data: Uint8Array }) => {
      if (path === '/cosmos.auth.v1beta1.Query/Account') return { height: 1, value: QueryAccountResponse.encode({ account: accountQuery() }).finish() };
      if (path === '/cosmos.tx.v1beta1.Service/Simulate') {
        simulated = TxRaw.decode(SimulateRequest.decode(data).txBytes);
        return { height: 1, value: SimulateResponse.encode(SimulateResponse.fromPartial({ gasInfo: { gasUsed: BigInt('100000') } })).finish() };
      }
      throw new Error(`Unexpected ABCI ${path}`);
    },
    txSearchAll: async () => ({ txs: [{ height: 2, index: 0, hash: sha256(broadcastBytes), tx: broadcastBytes,
      result: { code: 0, events: [], gasUsed: BigInt('100000'), gasWanted: BigInt('130000') } }] }),
  } as unknown as CometClient;
  vi.spyOn(GuruSigningClient, 'connectGuru').mockImplementation(async (_endpoint, signer, config, options) =>
    new GuruSigningClient(comet, signer, config, { ...options, broadcastPollIntervalMs: 1 }));
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); store.getState().disconnect();
  delete window.keplr; delete window.getOfflineSigner; delete window.getOfflineSignerAuto;
});


describe('Guru release v2.1.0 service flow, with network and wallet boundaries isolated', () => {
  it.each(goVectors)('matches actual release Go SDK sign bytes and TxRaw (mode $mode)', async vector => {
    expect(vector.address).toBe(sender);
    expect(vector.recipient).toBe(recipient);
    expect(fromHex(vector.pubkeyHex)).toEqual(pubkey);
    const response = { ...signatureEnvelope, signature: Buffer.from(vector.signatureHex, 'hex').toString('base64') };
    const getAccounts = async () => [{ address: sender, algo: 'secp256k1' as const, pubkey }];
    const client = new GuruSigningClient(undefined, vector.mode === 1 ? {
      getAccounts, signDirect: async (_who, doc) => {
        expect(SignDoc.encode(doc).finish()).toEqual(fromHex(vector.signBytesHex));
        return { signed: doc, signature: response };
      },
    } : {
      getAccounts, signAmino: async (_who, doc) => {
        expect(Buffer.from(serializeSignDoc(doc)).toString('hex')).toBe(vector.signBytesHex);
        return { signed: doc, signature: response };
      },
    }, chain);
    const tx = await client.sign(sender, [{ typeUrl: '/cosmos.bank.v1beta1.MsgSend', value: {
      fromAddress: sender, toAddress: recipient, amount: [{ denom: 'agxn', amount: '1' }],
    } }], { gas: '130000', amount: [{ denom: 'agxn', amount: '130' }] }, '',
    { accountNumber: 7, sequence: 9, chainId: 'guru_631-1' });
    expect(TxRaw.encode(tx).finish()).toEqual(fromHex(vector.txHex));
  });
  it.each([null, GURU_RELEASE_PUBKEY])('simulates then sends Direct with on-chain key %s', async keyType => {
    accountKeyType = keyType;
    const prepared = await prepareSendTx(input);
    expect(wallet.signDirect).not.toHaveBeenCalled();
    const sim = AuthInfo.decode(simulated!.authInfoBytes);
    expect(sim.signerInfos[0].publicKey!.typeUrl).toBe(GURU_RELEASE_PUBKEY);
    expect(PubKey.decode(sim.signerInfos[0].publicKey!.value).key).toEqual(pubkey);
    expect(await submitSendTx(prepared)).toMatchObject({ status: 'success' });
    expect(broadcast).toHaveBeenCalledOnce();
    const tx = TxRaw.decode(broadcastBytes);
    const auth = AuthInfo.decode(tx.authInfoBytes);
    expect(auth.signerInfos[0].publicKey!.typeUrl).toBe(GURU_RELEASE_PUBKEY);
    expect(auth.signerInfos[0].modeInfo!.single!.mode).toBe(1);
    expect(tx.signatures[0]).toHaveLength(64);
    expect(signedDoc!.accountNumber).toBe(BigInt(7));
    const msg = MsgSend.decode(TxBody.decode(tx.bodyBytes).messages[0].value);
    expect(msg).toEqual({ fromAddress: sender, toAddress: recipient, amount: [{ denom: 'agxn', amount: '1' }] });
  });
  it('signs raw Amino JSON using Keccak and encodes LEGACY_AMINO_JSON', async () => {
    wallet = { getAccounts: wallet.getAccounts, signAmino: vi.fn(async (_who, doc) => ({
      signed: doc, signature: await signBytes(serializeSignDoc(doc)),
    })) };
    expect(await submitSendTx(await prepareSendTx(input))).toMatchObject({ status: 'success' });
    expect(AuthInfo.decode(TxRaw.decode(broadcastBytes).authInfoBytes).signerInfos[0].modeInfo!.single!.mode).toBe(127);
  });
  it('rejects SHA256 signatures even if the wallet labels the curve secp256k1', async () => {
    wallet.signDirect = async (_who, doc) => ({ signed: doc, signature: await signBytes(SignDoc.encode(doc).finish(), sha256) });
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('Keccak');
    expect(broadcast).not.toHaveBeenCalled();
  });
  it('rejects high-S signatures that the release Go verifier rejects', async () => {
    wallet.signDirect = async (_who, doc) => {
      const signature = await signBytes(SignDoc.encode(doc).finish());
      const bytes = Buffer.from(signature.signature, 'base64');
      const order = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
      const high = order - BigInt(`0x${bytes.subarray(32).toString('hex')}`);
      bytes.set(Buffer.from(high.toString(16).padStart(64, '0'), 'hex'), 32);
      return { signed: doc, signature: { ...signature, signature: bytes.toString('base64') } };
    };
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('Keccak');
    expect(broadcast).not.toHaveBeenCalled();
  });
  it('does not extend Guru support to staking messages or batch sends', async () => {
    const signDirect = vi.fn();
    const client = new GuruSigningClient(undefined, { getAccounts: async () => [{ address: sender, algo: 'secp256k1', pubkey }], signDirect }, chain);
    for (const messages of [[{ typeUrl: '/cosmos.staking.v1beta1.MsgDelegate', value: {} }], []]) {
      await expect(client.sign(sender, messages, { amount: [], gas: '0' }, '', { accountNumber: 7, sequence: 9, chainId: 'guru_631-1' })).rejects.toThrow('단일 MsgSend');
    }
    expect(signDirect).not.toHaveBeenCalled();
  });
  it.each(['15e466dc7a7a8dacfd5ef0a93b3abe525c22a614', undefined])('blocks old or missing node commit %s before simulation/signing', async commit => {
    nodeCommit = commit;
    await expect(prepareSendTx(input)).rejects.toThrow('소스 커밋');
    expect(simulated).toBeUndefined(); expect(wallet.signDirect).not.toHaveBeenCalled();
  });
  it.each(['/guru.crypto.v1.ethsecp256k1.PubKey', '/cosmos.crypto.secp256k1.PubKey', '/ethermint.crypto.v1.ethsecp256k1.PubKey'])('rejects incompatible on-chain key %s', async key => {
    accountKeyType = key;
    await expect(prepareSendTx(input)).rejects.toThrow('공개키 타입');
    expect(wallet.signDirect).not.toHaveBeenCalled();
  });
  it('demonstrates the ordinary CosmJS parser still cannot decode the release key', () => {
    expect(() => accountFromAny(accountAny(GURU_RELEASE_PUBKEY))).toThrow();
    expect(signingAccountParser(chain)(accountAny(GURU_RELEASE_PUBKEY)).pubkey?.type).toBe('os/PubKeyEthSecp256k1');
  });
  it('uses the latest sequence, not the simulation snapshot', async () => {
    const prepared = await prepareSendTx(input); sequence = BigInt(9);
    await submitSendTx(prepared);
    expect(AuthInfo.decode(signedDoc!.authInfoBytes).signerInfos[0].sequence).toBe(BigInt(9));
  });
  it.each(['fee', 'body', 'account', 'sequence'] as const)('rejects returned Direct mutation: %s', async field => {
    wallet.signDirect = async (_who, doc) => {
      if (field === 'account') doc.accountNumber++;
      if (field === 'body') doc.bodyBytes = TxBody.encode(TxBody.fromPartial({ memo: 'changed' })).finish();
      if (field === 'fee' || field === 'sequence') {
        const auth = AuthInfo.decode(doc.authInfoBytes);
        if (field === 'fee') auth.fee!.gasLimit++;
        else auth.signerInfos[0].sequence++;
        doc.authInfoBytes = AuthInfo.encode(auth).finish();
      }
      return { signed: doc, signature: await signBytes(SignDoc.encode(doc).finish()) };
    };
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('변경');
    expect(broadcast).not.toHaveBeenCalled();
  });
  it('rejects Amino fee changes', async () => {
    wallet = { getAccounts: wallet.getAccounts, signAmino: async (_who, doc) => {
      const signed = { ...doc, fee: { ...doc.fee, gas: '1' } };
      return { signed, signature: await signBytes(serializeSignDoc(signed)) };
    } };
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('변경');
    expect(broadcast).not.toHaveBeenCalled();
  });
  it('recovers the first-use key from getKey', async () => {
    wallet.getAccounts = async () => [{ address: sender }];
    expect((await connectWallet('keplr', chain)).pubkey).toEqual(pubkey);
    expect(await submitSendTx(await prepareSendTx(input))).toMatchObject({ status: 'success' });
  });
  it.each(['isNanoLedger', 'isKeystone'] as const)('blocks hardware %s', async flag => {
    window.keplr!.getKey = async () => ({ bech32Address: sender, pubKey: pubkey, algo: 'secp256k1', [flag]: true });
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('하드웨어');
    expect(broadcast).not.toHaveBeenCalled();
  });
  it('preserves cancellation without retrying or broadcasting', async () => {
    wallet.signDirect = async () => { throw new Error('User rejected'); };
    expect(await submitSendTx(await prepareSendTx(input))).toMatchObject({ status: 'cancelled' });
    expect(broadcast).not.toHaveBeenCalled();
  });
  it('invalidates a pending signature on disconnect', async () => {
    wallet.signDirect = async (_who, doc) => {
      store.getState().disconnect();
      return { signed: doc, signature: await signBytes(SignDoc.encode(doc).finish()) };
    };
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('변경');
    expect(broadcast).not.toHaveBeenCalled();
  });
  it('rejects unsafe account numbers and a different derived address', () => {
    const unsafe = { typeUrl: COSMOS_ACCOUNT, value: BaseAccount.encode(BaseAccount.fromPartial({
      address: sender, accountNumber: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
    })).finish() };
    expect(() => signingAccountParser(chain)(unsafe)).toThrow('안전');
    const wrong = { typeUrl: COSMOS_ACCOUNT, value: BaseAccount.encode(BaseAccount.fromPartial({
      address: recipient, pubKey: { typeUrl: GURU_RELEASE_PUBKEY, value: PubKey.encode({ key: pubkey }).finish() },
    })).finish() };
    expect(() => signingAccountParser(chain)(wrong)).toThrow('도출');
  });
  it('requires the exact reviewed release profile and source-backed Keplr registration', () => {
    expect(signingProfileBlockReason(chain)).toBeNull();
    expect(signingProfileBlockReason({ ...chain, signingProfile: { ...cosmosSigningProfile, chainVersion: 'release/v2.1.0' } })).not.toBeNull();
    const registered = { ...chain, keplrRegistration: { coinType: 60, currency: 'GXN', evidence: 'source',
      bech32Config: { bech32PrefixAccAddr: 'guru', bech32PrefixAccPub: 'gurupub', bech32PrefixValAddr: 'guruvaloper',
        bech32PrefixValPub: 'guruvaloperpub', bech32PrefixConsAddr: 'guruvalcons', bech32PrefixConsPub: 'guruvalconspub' },
      gasPriceStep: { low: 1, average: 2, high: 3 } } };
    expect(buildKeplrChainInfo(registered).features).toEqual(['eth-address-gen', 'eth-key-sign', 'eth-secp256k1-cosmos']);
    registered.keplrRegistration.coinType = 118;
    expect(() => buildKeplrChainInfo(registered)).toThrow('coin type');
  });
});
