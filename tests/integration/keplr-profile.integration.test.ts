// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SigningStargateClient, accountFromAny } from '@cosmjs/stargate';
import type { CometClient } from '@cosmjs/tendermint-rpc';
import { sha256 } from '@cosmjs/crypto';
import { BaseAccount } from 'cosmjs-types/cosmos/auth/v1beta1/auth';
import { QueryAccountResponse } from 'cosmjs-types/cosmos/auth/v1beta1/query';
import { PubKey } from 'cosmjs-types/cosmos/crypto/secp256k1/keys';
import { SimulateRequest, SimulateResponse } from 'cosmjs-types/cosmos/tx/v1beta1/service';
import { AuthInfo, SignDoc, TxBody, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { MsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import { ChainConfigSchema, type ChainConfig } from '@/lib/env';
import { connectWallet } from '@/services/wallet/wallet-connector';
import { buildKeplrChainInfo, type KeplrSigner } from '@/services/wallet/keplr';
import { signingAccountParser, signingProfileBlockReason } from '@/services/wallet/signing-profile';
import { prepareSendTx, submitSendTx } from '@/services/guru/bank-tx.client';
import { useWalletSessionStore as store } from '@/stores/wallet-session.store';
import { cosmosAddress as sender, cosmosPubkey as pubkey, cosmosSigningProfile } from '../helpers/cosmos-signing';
import { bech32 } from 'bech32';

const recipient = bech32.encode('guru', bech32.toWords(new Uint8Array(20).fill(2)));
const chain: ChainConfig = {
  key: 'codec', name: 'Synthetic Cosmos', chainId: 'codec-1', lcdUrl: 'https://lcd.test', rpcUrl: 'https://rpc.test',
  bech32Prefix: 'guru', nativeDenom: 'utest', bondDenom: 'utest', feeDenom: 'utest', decimals: 6,
  signingProfile: cosmosSigningProfile,
  signing: ['direct', 'amino'].map(method => ({ wallet: 'keplr' as const, method: method as 'direct' | 'amino', evidence: 'synthetic only' })),
  rpcAccess: { origin: 'http://localhost:3000', get: true, post: true, options: true, observedAt: '2026-10-22', evidence: 'synthetic only' },
  sendFeePolicy: { mode: 'simulate', gasPrice: '0.001utest', gasMultiplierBps: 13000, evidence: 'synthetic only' },
};
const input = { walletType: 'keplr' as const, sessionTopic: null, bech32Address: sender, toAddress: recipient, amount: '1', denom: 'utest' };
const signature = { pub_key: { type: 'tendermint/PubKeySecp256k1', value: Buffer.from(pubkey).toString('base64') }, signature: Buffer.from(new Uint8Array(64)).toString('base64') };
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
  configure(); document.cookie = 'gf_chain=; max-age=0; path=/'; localStorage.clear(); store.getState().disconnect();
  store.getState().connect('keplr', sender, null, { chainKey: chain.key, chainId: chain.chainId!, pubkey });
  signedDoc = undefined; simulated = undefined; broadcastBytes = new Uint8Array(); accountKeyType = null; sequence = BigInt('0');
  wallet = { getAccounts: vi.fn(async () => [{ address: sender, pubkey, algo: 'secp256k1' }]),
    signDirect: vi.fn(async (_who, doc) => { signedDoc = doc; return { signed: doc, signature }; }) };
  window.keplr = { enable: vi.fn(async () => {}), getOfflineSignerAuto: vi.fn(async () => wallet),
    getKey: vi.fn(async () => ({ bech32Address: sender, pubKey: pubkey, algo: 'secp256k1' })) };
  window.getOfflineSigner = vi.fn(() => { throw new Error('Auto signer must take priority'); });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('node_info')) return Response.json({ default_node_info: { network: chain.chainId } });
    if (url.startsWith(chain.rpcUrl!)) return Response.json({ result: { node_info: { network: chain.chainId } } });
    if (url.includes('denoms_metadata')) return Response.json({ metadatas: [{ base: 'utest', display: 'TEST', symbol: 'TEST', denom_units: [{ denom: 'utest', exponent: 0 }, { denom: 'TEST', exponent: 6 }] }] });
    if (url.includes('/balances/')) return Response.json({ balances: [{ denom: 'utest', amount: '100000000' }] });
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
  vi.spyOn(SigningStargateClient, 'connectWithSigner').mockImplementation(async (_endpoint, signer, options) =>
    SigningStargateClient.createWithSigner(comet, signer, { ...options, broadcastPollIntervalMs: 1 }));
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); store.getState().disconnect();
  delete window.keplr; delete window.getOfflineSigner; delete window.getOfflineSignerAuto;
});

describe('W02 real Cosmos codec through service with network and wallet mocks', () => {
  it.each([null, '/cosmos.crypto.secp256k1.PubKey'])('prepares and sends with on-chain key %s without a deposit prerequisite', async keyType => {
    accountKeyType = keyType;
    const prepared = await prepareSendTx(input);
    expect(wallet.signDirect).not.toHaveBeenCalled();
    expect(AuthInfo.decode(simulated!.authInfoBytes).signerInfos[0].publicKey!.typeUrl).toBe(cosmosSigningProfile.pubkeyTypeUrl);
    expect(prepared.snapshot.fee).toEqual({ gas: '130000', amount: [{ denom: 'utest', amount: '130' }] });
    const result = await submitSendTx(prepared);
    expect(result.status).toBe('success'); expect(broadcast).toHaveBeenCalledOnce();
    expect(window.getOfflineSigner).not.toHaveBeenCalled();
    expect(signedDoc!.accountNumber).toBe(BigInt('7')); expect(signedDoc!.chainId).toBe('codec-1');
    const tx = TxRaw.decode(broadcastBytes); const auth = AuthInfo.decode(tx.authInfoBytes);
    expect(auth.signerInfos[0].modeInfo!.single!.mode).toBe(1);
    expect(auth.signerInfos[0].publicKey!.typeUrl).toBe(cosmosSigningProfile.pubkeyTypeUrl);
    const message = TxBody.decode(tx.bodyBytes).messages[0];
    expect(message.typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend');
    expect(MsgSend.decode(message.value)).toEqual({ fromAddress: sender, toAddress: recipient, amount: [{ denom: 'utest', amount: '1' }] });
  });
  it('uses Auto-selected Amino and emits LEGACY_AMINO_JSON', async () => {
    wallet = { getAccounts: wallet.getAccounts, signAmino: vi.fn(async (_who, doc) => ({ signed: doc, signature })) };
    await submitSendTx(await prepareSendTx(input));
    expect(wallet.signAmino).toHaveBeenCalledOnce();
    expect(AuthInfo.decode(TxRaw.decode(broadcastBytes).authInfoBytes).signerInfos[0].modeInfo!.single!.mode).toBe(127);
  });
  it('reads sequence again at signing instead of reusing simulation sequence', async () => {
    const prepared = await prepareSendTx(input); sequence = BigInt('4');
    await submitSendTx(prepared);
    expect(AuthInfo.decode(signedDoc!.authInfoBytes).signerInfos[0].sequence).toBe(BigInt('4'));
    expect(accountQuery).toHaveBeenCalledTimes(2);
  });
  it('recovers a missing signer key from getKey with no LCD pubkey request on connection', async () => {
    wallet.getAccounts = async () => [{ address: sender }];
    const result = await connectWallet('keplr', chain);
    expect(result.pubkey).toEqual(pubkey);
    expect(accountQuery).not.toHaveBeenCalled();
    expect(await submitSendTx(await prepareSendTx(input))).toMatchObject({ status: 'success' });
  });
  it('preserves wallet rejection and never broadcasts or falls back to the legacy signer', async () => {
    window.keplr!.getOfflineSignerAuto = vi.fn(async () => { throw new Error('Request rejected'); });
    expect(await submitSendTx(await prepareSendTx(input))).toMatchObject({ status: 'cancelled' });
    expect(broadcast).not.toHaveBeenCalled(); expect(window.getOfflineSigner).not.toHaveBeenCalled();
  });
  it.each(['account', 'body', 'sequence'] as const)('rejects returned Direct SignDoc mutation: %s', async field => {
    wallet.signDirect = vi.fn(async (_who, doc) => {
      const changed = SignDoc.decode(SignDoc.encode(doc).finish());
      if (field === 'account') changed.accountNumber++;
      if (field === 'body') changed.bodyBytes = TxBody.encode(TxBody.fromPartial({ memo: 'changed' })).finish();
      if (field === 'sequence') { const info = AuthInfo.decode(changed.authInfoBytes); info.signerInfos[0].sequence++; changed.authInfoBytes = AuthInfo.encode(info).finish(); }
      return { signed: changed, signature };
    });
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('변경');
    expect(broadcast).not.toHaveBeenCalled();
  });
  it('invalidates an Auto signer response after disconnect', async () => {
    window.keplr!.getOfflineSignerAuto = async () => { store.getState().disconnect(); return wallet; };
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('변경');
    expect(broadcast).not.toHaveBeenCalled();
  });
  it.each(['isNanoLedger', 'isKeystone'] as const)('blocks unverified hardware %s', async flag => {
    window.keplr!.getKey = async () => ({ bech32Address: sender, pubKey: pubkey, algo: 'secp256k1', [flag]: true });
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('하드웨어');
    expect(broadcast).not.toHaveBeenCalled();
  });
  it('rejects a mismatched wallet getKey address', async () => {
    window.keplr!.getKey = async () => ({ bech32Address: recipient, pubKey: pubkey, algo: 'secp256k1' });
    await expect(connectWallet('keplr', chain)).rejects.toThrow('wallet key');
  });
  it('does not cast an ethsecp256k1 algorithm into secp256k1', async () => {
    wallet.getAccounts = async () => [{ address: sender, pubkey, algo: 'ethsecp256k1' }];
    window.keplr!.getKey = async () => ({ bech32Address: sender, pubKey: pubkey, algo: 'ethsecp256k1' });
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('알고리즘');
    expect(wallet.signDirect).not.toHaveBeenCalled();
  });
  it('rejects an unsupported actual signer mode before wallet signing', async () => {
    configure({ signingProfile: { ...cosmosSigningProfile, signModes: ['amino'] } });
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('signer 방식');
    expect(wallet.signDirect).not.toHaveBeenCalled();
  });
  it.each(['ethermint', 'cosmos-evm'] as const)('blocks %s before simulate, wallet or broadcast', async family => {
    configure({ signingProfile: { ...cosmosSigningProfile, family, addressAlgorithm: 'ethereum', pubkeyTypeUrl: '/guru.crypto.v1.ethsecp256k1.PubKey' } });
    await expect(prepareSendTx(input)).rejects.toThrow('EVM');
    expect(accountQuery).not.toHaveBeenCalled(); expect(window.keplr!.enable).not.toHaveBeenCalled(); expect(broadcast).not.toHaveBeenCalled();
  });
  it('blocks missing profile and cannot relabel the observed TGXN as standard Cosmos', async () => {
    configure({ signingProfile: undefined }); await expect(prepareSendTx(input)).rejects.toThrow('프로필');
    expect(signingProfileBlockReason({ ...chain, chainId: 'guru_631-1' })).toContain('EVM');
  });
  it('reproduces the stock parser failure for the observed Guru key URL', () => {
    const guru = accountAny('/guru.crypto.v1.ethsecp256k1.PubKey');
    expect(() => accountFromAny(guru)).toThrow('not recognized');
    expect(() => signingAccountParser(chain)(guru)).toThrow('not recognized');
  });
  it('rejects a custom on-chain key during actual simulate before wallet access', async () => {
    accountKeyType = '/guru.crypto.v1.ethsecp256k1.PubKey';
    await expect(prepareSendTx(input)).rejects.toThrow('not recognized');
    expect(simulated).toBeUndefined(); expect(window.keplr!.enable).not.toHaveBeenCalled();
  });
  it('rejects unknown account wrappers and unsafe integer sequence', () => {
    expect(() => signingAccountParser(chain)({ ...accountAny(), typeUrl: '/ethermint.types.v1.EthAccount' })).toThrow('계정 타입');
    sequence = BigInt('9007199254740992');
    expect(() => signingAccountParser(chain)(accountAny())).toThrow();
  });
  it.each(['address', 'pubkey'] as const)('rejects an on-chain %s different from the wallet before simulation', async field => {
    accountQuery.mockImplementation(() => {
      const account = BaseAccount.decode(accountAny(cosmosSigningProfile.pubkeyTypeUrl).value);
      if (field === 'address') account.address = recipient;
      else account.pubKey!.value = PubKey.encode({ key: new Uint8Array(33).fill(3) }).finish();
      return { typeUrl: cosmosSigningProfile.accountTypeUrl, value: BaseAccount.encode(account).finish() };
    });
    await expect(prepareSendTx(input)).rejects.toThrow('지갑 계정');
    expect(simulated).toBeUndefined(); expect(window.keplr!.enable).not.toHaveBeenCalled();
  });
});

const registration: NonNullable<ChainConfig['keplrRegistration']> = {
  coinType: 118, currency: 'TEST', evidence: 'synthetic registration only',
  gasPriceStep: { low: 0.001, average: 0.002, high: 0.003 },
  bech32Config: { bech32PrefixAccAddr: 'guru', bech32PrefixAccPub: 'gurupub', bech32PrefixValAddr: 'guruvaloper',
    bech32PrefixValPub: 'guruvaloperpub', bech32PrefixConsAddr: 'guruvalcons', bech32PrefixConsPub: 'guruvalconspub' },
};
describe('W02 explicit chain registration', () => {
  it('suggests exact evidenced metadata before enable and Auto signer', async () => {
    const calls: string[] = [];
    window.keplr!.experimentalSuggestChain = vi.fn(async () => { calls.push('suggest'); });
    window.keplr!.enable = async () => { calls.push('enable'); };
    window.keplr!.getOfflineSignerAuto = async () => { calls.push('auto'); return wallet; };
    await connectWallet('keplr', { ...chain, keplrRegistration: registration });
    expect(calls).toEqual(['suggest', 'enable', 'auto']);
    expect(window.keplr!.experimentalSuggestChain).toHaveBeenCalledWith(expect.objectContaining({ bip44: { coinType: 118 }, features: [], chainId: 'codec-1',
      feeCurrencies: [{ coinDenom: 'TEST', coinMinimalDenom: 'utest', coinDecimals: 6, gasPriceStep: registration.gasPriceStep }] }));
  });
  it('does not retry registration after cancellation', async () => {
    window.keplr!.experimentalSuggestChain = vi.fn(async () => { throw new Error('User rejected'); });
    await expect(connectWallet('keplr', { ...chain, keplrRegistration: registration })).rejects.toThrow('rejected');
    expect(window.keplr!.enable).not.toHaveBeenCalled();
  });
  it('requires coin type evidence and rejects mismatching prefixes or currency metadata', () => {
    expect(() => ChainConfigSchema.parse({ ...chain, keplrRegistration: { ...registration, coinType: undefined } })).toThrow();
    expect(() => buildKeplrChainInfo({ ...chain, keplrRegistration: registration, bech32Prefix: 'other' })).toThrow('정보');
    expect(() => buildKeplrChainInfo({ ...chain, keplrRegistration: registration, feeDenom: 'other' })).toThrow('정보');
    expect(() => buildKeplrChainInfo({ ...chain, keplrRegistration: registration, signingProfile: { ...cosmosSigningProfile, family: 'cosmos-evm' } })).toThrow('EVM');
  });
});
