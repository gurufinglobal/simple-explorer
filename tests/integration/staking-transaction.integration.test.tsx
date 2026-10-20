// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bech32 } from 'bech32';
import { sha256 } from '@cosmjs/crypto';
import { AuthInfo, SignDoc, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import type { OfflineDirectSigner } from '@cosmjs/proto-signing';
import { BroadcastTxError } from '@cosmjs/stargate';
import type { ChainConfig } from '@/lib/env';
import { getActiveChainConfig, setActiveChainKeyCookie } from '@/lib/chain-selection';
import { displayToBase } from '@/lib/cosmos-amount';
import { SavedTransactions, TransactionResult } from '@/components/transactions/transaction-result';
import { prepareSendTx, type SendTxInput } from '@/services/guru/bank-tx.client';
import { loadReceipts, queryReceipt, saveReceipt } from '@/services/transactions/receipt';
import { transactionLink } from '@/services/transactions/transaction';
import { useWalletSessionStore as store } from '@/stores/wallet-session.store';
import { useWalletPortfolioStore as portfolio } from '@/stores/wallet-portfolio.store';
import ValidatorDetailPage from '@/app/(explorer)/staking/[validator]/page';
import { StakingForm } from '@/components/transactions/staking-form';
import { DashboardView } from '@/components/network/dashboard-view';
import { ValidatorDetailView } from '@/components/staking/validator-detail-view';
import { getValidatorDetail } from '@/services/guru/staking.service';
import { createQueryClient } from '@/services/clients';
import { prepareStakingTx, stakingMessages, type StakingTxInput } from '@/services/guru/staking-tx.client';
import type { StakingAction } from '@/services/transactions/transaction';
import { refreshTransactionReads } from '@/services/transactions/receipt';

const boundary = vi.hoisted(() => ({ connect: vi.fn(), simulate: vi.fn(), sign: vi.fn(), broadcast: vi.fn(), wallet: vi.fn(), search: 'a', hash: '' }));
vi.mock('@cosmjs/stargate', async original => ({ ...await original<typeof import('@cosmjs/stargate')>(), SigningStargateClient: { connectWithSigner: boundary.connect } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ hash: boundary.hash, validator }), useSearchParams: () => new URLSearchParams({ chain: boundary.search }) }));
const sender = bech32.encode('guru', bech32.toWords(new Uint8Array(20).fill(1)));
const recipient = bech32.encode('guru', bech32.toWords(new Uint8Array(20).fill(2)));
const pubkey = new Uint8Array(33).fill(3);
const signed = { bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), signatures: [] };
const hash = Array.from(sha256(TxRaw.encode(signed).finish()), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
const validator = bech32.encode('guruvaloper', bech32.toWords(new Uint8Array(20).fill(1)));
const otherValidator = bech32.encode('guruvaloper', bech32.toWords(new Uint8Array(20).fill(2)));
const a: ChainConfig = { key: 'a', name: 'A', chainId: 'a-1', lcdUrl: 'https://a.test:1317', rpcUrl: 'https://a.test:26657',
  nativeDenom: 'agxn', bondDenom: 'agxn', feeDenom: 'agxn', bech32Prefix: 'guru', decimals: 6,
  signing: [{ wallet: 'keplr', method: 'direct', evidence: 'synthetic fixture' }],
  rpcAccess: { origin: 'http://localhost:3000', get: true, post: true, options: true, observedAt: '2026-10-20', evidence: 'synthetic fixture' },
  features: { staking: true, distribution: true },
  stakingCapabilities: Object.fromEntries(Object.entries(stakingMessages).map(([action, definition]) => [action, { typeUrl: definition.typeUrl, evidence: 'synthetic only', signing: [{ wallet: 'keplr', method: 'direct', evidence: 'synthetic' }], fee: { mode: 'simulate', gasPrice: '0.001agxn', gasMultiplierBps: 13000, evidence: 'synthetic only' } }])),
  sendFeePolicy: { mode: 'simulate', gasPrice: '0.001agxn', gasMultiplierBps: 13000, evidence: 'synthetic fee fixture; no real-chain support assertion' },
};
const b = { ...a, key: 'b', name: 'B', chainId: 'b-1', lcdUrl: 'https://b.test:1317', rpcUrl: 'https://b.test:26657' };
const input: SendTxInput = { walletType: 'keplr', sessionTopic: null, bech32Address: sender, toAddress: recipient, amount: '1234567', denom: 'agxn', displayAmount: '1.234567' };
let validatorTokens: string;
let delegation: string;
let jailed: boolean;
let rewardFailure: boolean;
let spendable: { amount: string; denom: string }[] | null;
let balances: { amount: string; denom: string }[];
let http: ReturnType<typeof vi.fn<typeof fetch>>;
let txStatus: number;
let actualFee: unknown;
let addressFailure: boolean;
let detailFailure: boolean;
function configure(overrides: Partial<ChainConfig> = {}) {
  vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ ...a, ...overrides }, b]));
  vi.stubEnv('NEXT_PUBLIC_DEFAULT_CHAIN_KEY', 'a');
}
function connect() { store.getState().connect('keplr', sender, null, { chainKey: 'a', chainId: 'a-1', pubkey }); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
function response(input: string): Response {
  const url = new URL(input); const chainId = url.hostname === 'b.test' ? 'b-1' : 'a-1';
  if (url.port === '26657') return Response.json({ result: { node_info: { network: chainId } } });
  if (url.pathname.endsWith('/node_info')) return Response.json({ default_node_info: { network: chainId } });
  if (url.pathname.endsWith('/denoms_metadata')) return Response.json({ metadatas: ['agxn', 'uother'].map(denom => ({ base: denom, display: 'display', symbol: denom === 'agxn' ? 'GXN' : 'OTHER', denom_units: [{ denom, exponent: 0 }, { denom: 'display', exponent: getActiveChainConfig().decimals }] })) });
  if (url.pathname.includes('/spendable_balances/')) return Response.json({ balances: spendable ?? balances });
  if (url.pathname.includes('/auth/')) return Response.json({ account: { account_number: '1', sequence: '0' }, pagination: { total: '1' } });
  if (url.pathname.endsWith('/blocks/latest')) return Response.json({ block: { header: { height: '1', time: '2026-01-01T00:00:00Z', chain_id: chainId } } });
  if (url.pathname.endsWith('/supply/by_denom')) return Response.json({ amount: { amount: '1000000', denom: 'agxn' } });
  if (url.pathname.endsWith('/pool')) return Response.json({ pool: { bonded_tokens: '1' } });
  if (url.pathname.endsWith('/inflation')) return Response.json({ inflation: '0.01' });
  if (url.pathname.endsWith('/validators')) return Response.json({ validators: [{ operator_address: validator, tokens: '10' }] });
  if (url.pathname.endsWith(`/validators/${validator}`) || url.pathname.endsWith(`/validators/${otherValidator}`)) return Response.json({ validator: { operator_address: url.pathname.split('/').at(-1), jailed, status: 'BOND_STATUS_BONDED', tokens: validatorTokens } });
  if (url.pathname.includes(`/validators/${validator}/delegations/`) || url.pathname.includes(`/validators/${otherValidator}/delegations/`)) return Response.json({ delegation_response: { delegation: { delegator_address: sender, validator_address: url.pathname.split('/')[5] }, balance: { amount: delegation, denom: 'agxn' } } });
  if (url.pathname.includes('/validators/') && url.pathname.endsWith('/delegations')) return Response.json({ delegation_responses: [{ balance: { amount: delegation, denom: 'agxn' } }] });
  if (url.pathname.includes('/rewards/')) return rewardFailure ? new Response('', { status: 503 }) : Response.json({ rewards: [{ amount: '1.000000000000000001', denom: 'agxn' }, { amount: '0.0003', denom: 'unknown' }] });
  if (url.pathname.endsWith('/commission')) return Response.json({ commission: { commission: [{ amount: '1.000000000000000001', denom: 'agxn' }] } });
  if (url.pathname.endsWith('/outstanding_rewards')) return Response.json({ rewards: { rewards: [] } });
  if (url.pathname.includes('/unbonding_delegations/')) return Response.json({ unbond: { entries: [] } });
  if (url.pathname.includes('/balances/')) return Response.json({ balances });
  if (url.pathname.endsWith('/txs')) return addressFailure ? new Response('', { status: 503 }) : Response.json({ tx_responses: [], txs: [] });
  if (url.pathname.includes('/txs/')) return detailFailure ? new Response('', { status: 404 }) : Response.json({ tx_response: { txhash: hash, code: txStatus, height: '123', raw_log: txStatus ? 'insufficient funds' : '' }, tx: { body: { messages: [] }, auth_info: { fee: { amount: actualFee } } } });
  if (url.pathname.endsWith('/params')) return Response.json({ params: { bond_denom: 'agxn', unbonding_time: '86400s' } });
  if (url.pathname.endsWith('/rewards')) return Response.json({ total: [] });
  if (url.pathname.includes('/unbonding_delegations')) return Response.json({ unbonding_responses: [] });
  if (url.pathname.includes('/delegations/')) return Response.json({ delegation_responses: [] });
  throw new Error(`Unexpected HTTP ${url.pathname}`);
}
beforeEach(() => {
  vi.clearAllMocks(); document.cookie = 'gf_chain=; max-age=0; path=/'; localStorage.clear(); configure(); connect();
  boundary.hash = hash; boundary.search = 'a';
  balances = [{ denom: 'agxn', amount: '999999999999999999999999999999999999999999' }];
  validatorTokens = '1234'; delegation = '99999999999999999999999999999999999'; jailed = false; rewardFailure = false; spendable = null;
  txStatus = 0; actualFee = [{ denom: 'agxn', amount: '130' }]; addressFailure = false; detailFailure = false;
  http = vi.fn<typeof fetch>(async url => response(String(url))); vi.stubGlobal('fetch', http);
  window.keplr = { enable: vi.fn().mockResolvedValue(undefined) };
  boundary.wallet.mockResolvedValue({ signed: SignDoc.fromPartial({ chainId: 'a-1' }), signature: { signature: '', pub_key: { type: '', value: '' } } });
  window.getOfflineSigner = vi.fn(() => ({ getAccounts: async () => [{ address: sender, pubkey, algo: 'secp256k1' }], signDirect: boundary.wallet }));
  boundary.simulate.mockResolvedValue(100000);
  boundary.broadcast.mockResolvedValue({ code: 0, transactionHash: hash, rawLog: '' });
  boundary.connect.mockImplementation(async (_rpc, signer: OfflineDirectSigner) => ({
    simulate: async (...args: unknown[]) => { await signer.getAccounts(); return boundary.simulate(...args); },
    sign: async (...args: unknown[]) => { boundary.sign(...args); await signer.signDirect(sender, SignDoc.fromPartial({ chainId: getActiveChainConfig().chainId! })); return signed; },
    broadcastTx: boundary.broadcast, disconnect: vi.fn(),
  }));
});

afterEach(() => { cleanup(); store.getState().disconnect(); portfolio.getState().clear(); delete window.keplr; delete window.getOfflineSigner; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const actions = ['delegate', 'undelegate', 'reward', 'commission'] as const;
const labels = { delegate: 'Delegate', undelegate: 'Undelegate', reward: 'Claim Reward', commission: 'Claim Operator Reward' };
function stakingInput(action: StakingAction, target = validator): StakingTxInput {
  const base = { walletType: 'keplr' as const, sessionTopic: null, bech32Address: sender, validatorAddress: target };
  return action === 'delegate' || action === 'undelegate' ? { ...base, action, amount: '1234567', denom: 'agxn', displayAmount: '1.234567' } : { ...base, action };
}
async function open(action: StakingAction) {
  render(<StakingForm validatorAddress={validator} isOperator />);
  if (action === 'delegate' || action === 'undelegate') {
    fireEvent.change(screen.getByLabelText('수량 (표시 단위)'), { target: { value: '1.234567' } });
    await screen.findByText('표시 수량 1.234567 GXN → 전송 원본 1234567 agxn');
    fireEvent.click(screen.getByRole('checkbox'));
  }
  const trigger = screen.getByRole('button', { name: labels[action] }); trigger.focus(); fireEvent.click(trigger);
  return screen.findByRole('dialog');
}
async function approve() { fireEvent.click(await screen.findByRole('button', { name: '확인하고 지갑 서명' })); }

describe.each(actions)('W06 %s real UI / service / signing flow', action => {
  it('confirms exact message and fee, broadcasts once, reads chain detail / position / portfolio / validator', async () => {
    const dialog = await open(action);
    expect(dialog.textContent).toContain('a / a-1'); expect(dialog.textContent).toContain(sender); expect(dialog.textContent).toContain(validator);
    expect(dialog.textContent).toContain('130 agxn'); expect(dialog.textContent).toContain('130000'); expect(dialog.textContent).toContain('simulate');
    if (action === 'delegate' || action === 'undelegate') expect(dialog.textContent).toContain('1234567 agxn');
    else { expect(dialog.textContent).toContain('관찰값'); expect(dialog.textContent).toContain('1.000000000000000001 agxn'); expect(dialog.textContent).not.toContain('전송 원본:'); }
    expect(boundary.wallet).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '확인하고 지갑 서명' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '확인하고 지갑 서명' }));
    await screen.findByText('체인 포함 성공 · code 0');
    await waitFor(() => expect(http.mock.calls.some(([u]) => String(u).includes('/outstanding_rewards'))).toBe(true));
    expect(boundary.broadcast).toHaveBeenCalledOnce();
    const [who, messages, fee] = boundary.sign.mock.calls[0];
    expect(who).toBe(sender); expect(messages).toHaveLength(1); expect(messages[0].typeUrl).toBe(stakingMessages[action].typeUrl);
    expect(messages[0].value.validatorAddress).toBe(validator);
    if (action !== 'commission') expect(messages[0].value.delegatorAddress).toBe(sender);
    if (action === 'delegate' || action === 'undelegate') expect(messages[0].value.amount).toEqual({ denom: 'agxn', amount: '1234567' });
    else expect(messages[0].value.amount).toBeUndefined();
    expect(fee).toEqual({ gas: '130000', amount: [{ amount: '130', denom: 'agxn' }] });
    expect((await screen.findByRole('link', { name: /거래 상세/ })).getAttribute('href')).toBe(`/tx/${hash}?chain=a`);
    await waitFor(() => expect(loadReceipts()[0].actualFee).toEqual(actualFee));
    expect(loadReceipts()[0].staking).toEqual({ action, validator });
    const urls = http.mock.calls.map(([u]) => String(u));
    expect(urls.some(u => u.includes('/unbonding_delegations'))).toBe(true); expect(urls.some(u => u.endsWith('/rewards'))).toBe(true);
  });
  it('Escape cancels with restored focus and zero broadcast', async () => {
    const user = userEvent.setup(); await open(action);
    await waitFor(() => expect(document.activeElement?.textContent).toBe('취소'));
    await user.keyboard('{Escape}');
    await screen.findByText('앱 확인을 취소했습니다. 전송하지 않았습니다.');
    await waitFor(() => expect(document.activeElement?.textContent).toBe(labels[action]));
    expect(boundary.broadcast).not.toHaveBeenCalled(); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('wallet rejection is cancelled with zero broadcast', async () => {
    boundary.wallet.mockRejectedValue(new Error('User rejected signing'));
    await open(action); await approve(); await screen.findByText(/지갑 서명이 취소/); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('code failure keeps code/hash/cause and has no success message', async () => {
    boundary.broadcast.mockResolvedValue({ code: 9, transactionHash: hash, rawLog: 'staking rejected' }); txStatus = 9; detailFailure = true;
    await open(action); await approve(); await screen.findByText('staking rejected · code 9');
    expect(screen.queryByText(/체인 포함 성공/)).toBeNull(); expect(loadReceipts()[0]).toMatchObject({ code: 9, hash, status: 'failed', staking: { action, validator } });
  });
  it('timeout is pending, survives reload, re-queries original action and never auto-resends', async () => {
    boundary.broadcast.mockRejectedValue(new Error('Timeout'));
    await open(action); await approve(); await screen.findByText(/확인 중 · Timeout/);
    const pending = loadReceipts()[0]; expect(pending).toMatchObject({ status: 'pending', hash, staking: { action, validator } });
    cleanup(); render(<SavedTransactions chainKey="a" />); fireEvent.click(screen.getByText(/보관된 거래 결과/));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(hash) }));
    fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await screen.findByText(/체인 포함 성공/);
    await waitFor(() => expect(http.mock.calls.some(([u]) => String(u).includes('/outstanding_rewards'))).toBe(true));
    expect(boundary.broadcast).toHaveBeenCalledOnce();
  });
  it('blocks fee shortage without using future rewards', async () => {
    spendable = [{ denom: 'agxn', amount: '1' }];
    await expect(prepareStakingTx(stakingInput(action))).rejects.toThrow('사용 가능 잔액'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('rechecks spendable balance immediately before wallet signing', async () => {
    const tx = await prepareStakingTx(stakingInput(action));
    window.keplr!.enable = vi.fn(async () => { spendable = []; });
    await expect(tx.execute(() => {})).rejects.toThrow('사용 가능 잔액'); expect(boundary.wallet).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('invalidates account A-B-A during wallet wait', async () => {
    const pending = deferred<Awaited<ReturnType<OfflineDirectSigner['signDirect']>>>(); boundary.wallet.mockReturnValue(pending.promise);
    const tx = await prepareStakingTx(stakingInput(action)); const sending = tx.execute(() => {});
    const rejected = expect(sending).rejects.toThrow('변경');
    await waitFor(() => expect(boundary.wallet).toHaveBeenCalledOnce());
    store.getState().disconnect(); connect();
    pending.resolve({ signed: SignDoc.fromPartial({ chainId: 'a-1' }), signature: { signature: '', pub_key: { type: '', value: '' } } });
    await rejected; expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('requires message-specific capability and never inherits send fees', async () => {
    configure({ stakingCapabilities: undefined });
    await expect(prepareStakingTx(stakingInput(action))).rejects.toThrow('메시지·수수료'); expect(boundary.simulate).not.toHaveBeenCalled();
  });
  it('keeps inclusion success separate from partial refresh failure and retry recovery', async () => {
    const tx = await prepareStakingTx(stakingInput(action)); const receipt = await tx.execute(() => {});
    rewardFailure = true; render(<TransactionResult receipt={receipt} />);
    await screen.findByText(/거래 성공 후 화면 갱신 실패/); expect(screen.getByText(/체인 포함 성공/)).toBeTruthy();
    rewardFailure = false; fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await waitFor(() => expect(screen.queryByText(/거래 성공 후 화면 갱신 실패/)).toBeNull()); expect(boundary.broadcast).toHaveBeenCalledOnce();
  });
});

describe('W06 validation / invalidation / entry points', () => {
  it('blocks non-operator direct commission calls', async () => {
    await expect(prepareStakingTx(stakingInput('commission', otherValidator))).rejects.toThrow('운영자'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('distinguishes delegation position from spendable funds', async () => {
    delegation = '10'; await expect(prepareStakingTx(stakingInput('undelegate'))).rejects.toThrow('위임 잔액');
    validatorTokens = '1234'; delegation = '999999999'; spendable = [{ denom: 'agxn', amount: '130' }];
    await expect(prepareStakingTx(stakingInput('delegate'))).rejects.toThrow('사용 가능');
    expect((await prepareStakingTx(stakingInput('undelegate'))).snapshot.amount).toBe('1234567');
  });
  it.each(['delegate', 'undelegate'] as const)('%s preserves 6/18 decimals, large integers and smallest unit', async action => {
    for (const decimals of [6, 18]) {
      configure({ decimals });
      for (const display of ['9007199254740993.123456', decimals === 6 ? '0.000001' : '0.000000000000000001']) {
        const amount = displayToBase(display, decimals); delegation = balances[0].amount;
        const params = { ...stakingInput(action), action, amount, denom: 'agxn', displayAmount: display };
        const tx = await prepareStakingTx(params); expect(tx.snapshot.amount).toBe(amount);
        await tx.execute(() => {}); expect(boundary.sign.mock.calls.at(-1)![1][0].value.amount).toEqual({ amount, denom: 'agxn' });
      }
    }
  });
  it.each(['0', '00', '-1', '1e6', '1.1'])('rejects invalid base amount %s', async amount => {
    await expect(prepareStakingTx({ ...stakingInput('delegate'), action: 'delegate', amount, denom: 'agxn' })).rejects.toThrow(); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it.each(['bad', sender, validator.slice(0, -1) + 'q'])('rejects invalid validator checksum/prefix %s', async target => {
    await expect(prepareStakingTx(stakingInput('delegate', target))).rejects.toThrow('검증자 주소');
  });
  it('blocks mismatched staking params and malformed position instead of treating them as zero', async () => {
    http.mockImplementation(async url => String(url).endsWith('/params') ? Response.json({ params: { bond_denom: 'other', unbonding_time: '86400s' } }) : response(String(url)));
    await expect(prepareStakingTx(stakingInput('delegate'))).rejects.toThrow('bond denom');
    http.mockImplementation(async url => String(url).includes(`/delegations/${sender}`) ? Response.json({}) : response(String(url)));
    await expect(prepareStakingTx(stakingInput('undelegate'))).rejects.toThrow(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('requires explicit module, message, actual signer method and valid fee asset', async () => {
    configure({ features: { staking: false, distribution: true } }); await expect(prepareStakingTx(stakingInput('delegate'))).rejects.toThrow('모듈');
    const cap = a.stakingCapabilities!.delegate!;
    configure({ stakingCapabilities: { delegate: { ...cap, typeUrl: '/unknown' } } }); await expect(prepareStakingTx(stakingInput('delegate'))).rejects.toThrow('메시지');
    configure({ stakingCapabilities: { delegate: { ...cap, fee: { ...cap.fee, gasPrice: '1uother' } } } }); await expect(prepareStakingTx(stakingInput('delegate'))).rejects.toThrow('수수료 가격');
    configure({ signing: [...a.signing!, { wallet: 'keplr', method: 'amino', evidence: 'synthetic' }], stakingCapabilities: { delegate: { ...cap, signing: [{ wallet: 'keplr', method: 'amino', evidence: 'synthetic' }] } } });
    const tx = await prepareStakingTx(stakingInput('delegate')); await expect(tx.execute(() => {})).rejects.toThrow('실제 지갑 서명 방식'); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('failed simulation blocks; explicit per-action fixed fallback states evidence', async () => {
    boundary.simulate.mockRejectedValue(new Error('simulate unavailable'));
    await expect(prepareStakingTx(stakingInput('reward'))).rejects.toThrow('수수료 추정 실패'); expect(boundary.wallet).not.toHaveBeenCalled();
    const cap = a.stakingCapabilities!.reward!;
    configure({ stakingCapabilities: { reward: { ...cap, fee: { ...a.sendFeePolicy!, mode: 'simulate', gasMultiplierBps: 13000, fallback: { gas: 220000, evidence: 'reward-specific synthetic fixed evidence' } } } } });
    const tx = await prepareStakingTx(stakingInput('reward')); expect(tx.snapshot.fee.gas).toBe('220000'); expect(tx.snapshot.feeBasis).toContain('reward-specific');
  });
  it('preserves unknown decimal reward metadata without inventing an amount', async () => {
    const tx = await prepareStakingTx(stakingInput('reward')); expect(tx.snapshot.amount).toBeUndefined();
    expect(tx.snapshot.observedRewards).toContainEqual({ amount: '0.0003', denom: 'unknown' });
    expect(() => { (tx.snapshot.observedRewards![0] as { amount: string }).amount = '99'; }).toThrow();
  });
  it('latest position and jailed state are checked immediately before signature', async () => {
    const tx = await prepareStakingTx(stakingInput('undelegate'));
    window.keplr!.enable = vi.fn(async () => { delegation = '1'; });
    await expect(tx.execute(() => {})).rejects.toThrow('위임 잔액'); expect(boundary.wallet).not.toHaveBeenCalled();
    const other = await prepareStakingTx(stakingInput('delegate')); jailed = true;
    await expect(other.execute(() => {})).rejects.toThrow('jailed');
  });
  it.each(['input', 'validator', 'account', 'chain', 'disconnect'])('invalidates %s change during confirmation', async change => {
    const view = render(<StakingForm validatorAddress={validator} isOperator />);
    fireEvent.click(screen.getByRole('button', { name: 'Claim Reward' })); await screen.findByRole('dialog');
    act(() => {
      if (change === 'input') fireEvent.change(screen.getByLabelText('수량 (표시 단위)'), { target: { value: '2' } });
      if (change === 'validator') view.rerender(<StakingForm validatorAddress={otherValidator} isOperator />);
      if (change === 'account') store.getState().connect('keplr', recipient, null, { chainKey: 'a', chainId: 'a-1', pubkey });
      if (change === 'chain') { setActiveChainKeyCookie('b'); setActiveChainKeyCookie('a'); }
      if (change === 'disconnect') store.getState().disconnect();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('discard late preparation after an input A-B-A transition', async () => {
    const pending = deferred<number>(); boundary.simulate.mockReturnValue(pending.promise);
    render(<StakingForm validatorAddress={validator} isOperator />); fireEvent.click(screen.getByRole('button', { name: 'Claim Reward' }));
    await waitFor(() => expect(boundary.simulate).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText('수량 (표시 단위)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('수량 (표시 단위)'), { target: { value: '' } });
    await act(async () => { pending.resolve(100000); }); expect(screen.queryByRole('dialog')).toBeNull(); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('cancelled and expired prepared approvals cannot execute', async () => {
    const tx = await prepareStakingTx(stakingInput('commission')); tx.cancel(); await expect(tx.execute(() => {})).rejects.toThrow('변경');
    const expired = await prepareStakingTx(stakingInput('commission')); const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 120001);
    try { await expect(expired.execute(() => {})).rejects.toThrow('2분'); } finally { clock.mockRestore(); }
    expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('shares the same account lock with send and blocks concurrent staking', async () => {
    const send = await prepareSendTx(input); const stake = await prepareStakingTx(stakingInput('delegate')); const wait = deferred<never>(); boundary.wallet.mockReturnValue(wait.promise);
    const sending = send.execute(() => {}); await waitFor(() => expect(boundary.wallet).toHaveBeenCalledOnce());
    await expect(stake.execute(() => {})).rejects.toThrow('이미 처리'); wait.reject(new Error('rejected')); await sending; expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('blocks tampered direct message bytes', async () => {
    boundary.wallet.mockResolvedValue({ signed: SignDoc.fromPartial({ chainId: 'a-1', bodyBytes: new Uint8Array([9]) }), signature: { signature: '', pub_key: { type: '', value: '' } } });
    const tx = await prepareStakingTx(stakingInput('delegate')); await expect(tx.execute(() => {})).rejects.toThrow('본문'); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('retains v1 send records and staking context, preserves terminal outcome from stale pending', async () => {
    const tx = await prepareStakingTx(stakingInput('reward')); const receipt = await tx.execute(() => {});
    const legacy = { ...receipt, hash: 'B'.repeat(64), staking: undefined }; saveReceipt(legacy);
    saveReceipt({ ...receipt, status: 'pending', message: 'late timeout' }); expect(loadReceipts()).toHaveLength(2);
    expect(loadReceipts().find(r => r.hash === hash)).toMatchObject({ status: 'success', staking: { action: 'reward', validator } });
    expect(loadReceipts().find(r => r.hash === legacy.hash)?.staking).toBeUndefined();
  });
  it('refreshes original chain and never writes old account data into current portfolio', async () => {
    const tx = await prepareStakingTx(stakingInput('commission')); const receipt = await tx.execute(() => {});
    setActiveChainKeyCookie('b'); store.getState().connect('keplr', recipient, null, { chainKey: 'b', chainId: 'b-1', pubkey });
    http.mockClear(); await refreshTransactionReads(receipt);
    expect(http.mock.calls.every(([u]) => new URL(String(u)).hostname === 'a.test')).toBe(true);
    expect(portfolio.getState().result.context.target).not.toBe(`portfolio:${sender}`); expect(transactionLink(receipt)).toContain('chain=a');
  });
  it('dashboard delegate entry executes the shared confirmation', async () => {
    render(<DashboardView />); fireEvent.click(screen.getByRole('button', { name: 'DELEGATE' }));
    await waitFor(() => expect(http.mock.calls.some(([u]) => String(u).includes('/validators?'))).toBe(true));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Validator' })); fireEvent.click(await screen.findByRole('option'));
    fireEvent.change(screen.getByLabelText('수량 (표시 단위)'), { target: { value: '1.234567' } });
    await screen.findByText('표시 수량 1.234567 GXN → 전송 원본 1234567 agxn'); fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Delegate Tx' })); await screen.findByRole('dialog'); await approve();
    await screen.findByText(/체인 포함 성공/); expect(boundary.sign.mock.calls[0][1][0].typeUrl).toBe(stakingMessages.delegate.typeUrl);
  });
  it('validator detail entry reads its position and exposes all four shared actions', async () => {
    const detail = await getValidatorDetail(validator, createQueryClient(a)); render(<ValidatorDetailView detail={detail!} />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Claim Operator Reward' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Claim Operator Reward' })); await screen.findByRole('dialog'); await approve();
    await screen.findByText(/체인 포함 성공/); expect(boundary.sign.mock.calls[0][1][0].typeUrl).toBe(stakingMessages.commission.typeUrl);
  });
});

describe('W06 result integrity', () => {
  it.each(actions)('%s preserves CheckTx rejection evidence', async action => {
    boundary.broadcast.mockRejectedValue(new BroadcastTxError(7, 'sdk', 'checktx rejected'));
    const receipt = await (await prepareStakingTx(stakingInput(action))).execute(() => {});
    expect(receipt).toMatchObject({ code: 7, hash, status: 'failed', message: 'checktx rejected' });
    detailFailure = true; expect(await queryReceipt(receipt)).toMatchObject({ code: 7, hash, status: 'failed' });
  });
  it.each(actions)('%s keeps ambiguous node response pending with computed hash', async action => {
    boundary.broadcast.mockResolvedValue({ code: undefined, transactionHash: 'wrong' });
    const receipt = await (await prepareStakingTx(stakingInput(action))).execute(() => {});
    expect(receipt).toMatchObject({ status: 'pending', hash }); expect(boundary.broadcast).toHaveBeenCalledOnce();
  });
  it('prevents direct signer account number mutation', async () => {
    boundary.wallet.mockResolvedValue({ signed: SignDoc.fromPartial({ chainId: 'a-1', accountNumber: BigInt(99) }), signature: { signature: '', pub_key: { type: '', value: '' } } });
    await expect((await prepareStakingTx(stakingInput('commission'))).execute(() => {})).rejects.toThrow('계정 번호'); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
});

describe('W06 service context guards', () => {
  it('invalidates service-only chain A-B-A without relying on a mounted hook', async () => {
    const tx = await prepareStakingTx(stakingInput('reward')); setActiveChainKeyCookie('b'); setActiveChainKeyCookie('a');
    await expect(tx.execute(() => {})).rejects.toThrow('변경'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('blocks tampered direct signer info and sequence', async () => {
    boundary.wallet.mockResolvedValue({ signed: SignDoc.fromPartial({ chainId: 'a-1', authInfoBytes: AuthInfo.encode(AuthInfo.fromPartial({ signerInfos: [{ sequence: BigInt(99) }] })).finish() }), signature: { signature: '', pub_key: { type: '', value: '' } } });
    await expect((await prepareStakingTx(stakingInput('reward'))).execute(() => {})).rejects.toThrow('sequence'); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
});

describe('W06 refreshed rendered data', () => {
  it('updates validator metrics and keeps result visible after position reloading', async () => {
    render(<ValidatorDetailPage />); await screen.findByText('0.001234 GXN');
    boundary.broadcast.mockImplementation(async () => { validatorTokens = '5678'; delegation = '8000000'; return { code: 0, transactionHash: hash }; });
    fireEvent.click(screen.getByRole('button', { name: 'Claim Reward' })); await screen.findByRole('dialog'); await approve();
    await screen.findByText('0.005678 GXN'); await screen.findAllByText('8 GXN');
    expect(await screen.findByText(/체인 포함 성공/)).toBeTruthy(); expect(boundary.broadcast).toHaveBeenCalledOnce();
  });
});
