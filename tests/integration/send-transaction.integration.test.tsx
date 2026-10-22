// @vitest-environment jsdom
import { cosmosAddress, cosmosPubkey, cosmosSigningProfile } from "../helpers/cosmos-signing";
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bech32 } from 'bech32';
import { sha256 } from '@cosmjs/crypto';
import { SignDoc, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import type { OfflineDirectSigner } from '@cosmjs/proto-signing';
import { BroadcastTxError } from '@cosmjs/stargate';
import type { ChainConfig } from '@/lib/env';
import { getActiveChainConfig, setActiveChainKeyCookie } from '@/lib/chain-selection';
import { displayToBase } from '@/lib/cosmos-amount';
import { SendForm } from '@/components/transactions/send-form';
import { SavedTransactions, TransactionResult } from '@/components/transactions/transaction-result';
import { prepareSendTx, submitSendTx, type SendTxInput } from '@/services/guru/bank-tx.client';
import { loadReceipts, queryReceipt, saveReceipt } from '@/services/transactions/receipt';
import { transactionLink, type TransactionReceipt } from '@/services/transactions/transaction';
import { useWalletSessionStore as store } from '@/stores/wallet-session.store';
import { useWalletPortfolioStore as portfolio } from '@/stores/wallet-portfolio.store';
import { ExplorerShell } from '@/components/layout/explorer-shell';
import TxPage from '@/app/(explorer)/tx/[hash]/page';

const boundary = vi.hoisted(() => ({ connect: vi.fn(), simulate: vi.fn(), sign: vi.fn(), broadcast: vi.fn(), wallet: vi.fn(), search: 'a', hash: '' }));
vi.mock('@cosmjs/stargate', async original => ({ ...await original<typeof import('@cosmjs/stargate')>(), SigningStargateClient: { connectWithSigner: boundary.connect } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ hash: boundary.hash }), useSearchParams: () => new URLSearchParams(window.location.search), usePathname: () => window.location.pathname, useRouter: () => ({ push: vi.fn() }) }));
const sender = cosmosAddress;
const recipient = bech32.encode('guru', bech32.toWords(new Uint8Array(20).fill(2)));
const pubkey = cosmosPubkey;
const signed = { bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), signatures: [] };
const hash = Array.from(sha256(TxRaw.encode(signed).finish()), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
const a: ChainConfig = { signingProfile: cosmosSigningProfile, key: 'a', name: 'A', chainId: 'a-1', lcdUrl: 'https://a.test:1317', rpcUrl: 'https://a.test:26657',
  nativeDenom: 'agxn', bondDenom: 'agxn', feeDenom: 'agxn', bech32Prefix: 'guru', decimals: 6,
  signing: [{ wallet: 'keplr', method: 'direct', evidence: 'synthetic fixture' }],
  rpcAccess: { origin: 'http://localhost:3000', get: true, post: true, options: true, observedAt: '2026-10-20', evidence: 'synthetic fixture' },
  sendFeePolicy: { mode: 'simulate', gasPrice: '0.001agxn', gasMultiplierBps: 13000, evidence: 'synthetic fee fixture; no real-chain support assertion' },
};
const b = { ...a, key: 'b', name: 'B', chainId: 'b-1', lcdUrl: 'https://b.test:1317', rpcUrl: 'https://b.test:26657' };
const input: SendTxInput = { walletType: 'keplr', sessionTopic: null, bech32Address: sender, toAddress: recipient, amount: '1234567', denom: 'agxn', displayAmount: '1.234567' };
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
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks(); document.cookie = 'gf_chain=; max-age=0; path=/'; localStorage.clear(); configure(); connect();
  boundary.hash = hash; boundary.search = 'a';
  balances = [{ denom: 'agxn', amount: '999999999999999999999999999999999999999999' }];
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

describe('W05 saved receipt updates and lookup races (F1)', () => {
  const pending: TransactionReceipt = { chainKey: 'a', chainId: 'a-1', sender, hash, status: 'pending',
    message: '전송·포함 확인 중', estimatedFee: [], actualFee: null };
  const outcomes: TransactionReceipt[] = [
    { ...pending, status: 'failed', code: 5, message: 'rejected checktx' },
    { ...pending, status: 'success', code: 0, message: '체인 포함 성공', actualFee: [{ denom: 'agxn', amount: '999' }], feeWarning: '실제 fee 불일치' },
    { ...pending, message: '확인 중 · Timeout waiting for inclusion', feeWarning: '응답을 확인하지 못했습니다.' },
  ];
  async function openPending() {
    saveReceipt(pending);
    render(<SavedTransactions chainKey="a" />);
    fireEvent.click(screen.getByText(/보관된 거래 결과/));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(hash) }));
    expect(screen.getByRole('status').textContent).toBe(pending.message);
  }
  it.each(outcomes)('updates an expanded receipt to $status including message and warnings', async next => {
    await openPending();
    act(() => { saveReceipt(next); });
    expect(screen.getByRole('status').textContent).toContain(next.message);
    if (next.feeWarning) expect(screen.getByText(next.feeWarning)).toBeTruthy();
    expect(loadReceipts()[0]).toEqual(next);
    expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it.each(outcomes.slice(0, 2))('preserves $status evidence when a later lookup returns 404', async next => {
    await openPending();
    act(() => { saveReceipt(next); });
    detailFailure = true;
    fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await screen.findByText(/거래 상세 재조회 실패/);
    expect(screen.getByRole('status').textContent).toContain(next.message);
    expect(loadReceipts()[0]).toMatchObject(next);
    if (next.feeWarning) expect(screen.getByText(next.feeWarning)).toBeTruthy();
    expect(screen.queryByText(/거래 성공 후 화면 갱신 실패/)).toBeNull();
  });
  for (const reply of ['404', 'success', 'failed']) {
    it.each(outcomes)(`ignores an older ${reply} lookup completing after a new $status receipt`, async next => {
      const lookup = deferred<Response>();
      http.mockImplementation(async url => String(url).includes('/txs/') ? lookup.promise : response(String(url)));
      await openPending();
      fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
      await waitFor(() => expect(http.mock.calls.some(([url]) => String(url).includes('/txs/'))).toBe(true));
      act(() => { saveReceipt(next); });
      txStatus = reply === 'failed' ? 9 : 0;
      await act(async () => { lookup.resolve(reply === '404' ? new Response('', { status: 404 }) : response(`https://a.test:1317/cosmos/tx/v1beta1/txs/${hash}`)); });
      expect(screen.getByRole('status').textContent).toContain(next.message);
      expect(loadReceipts()[0]).toEqual(next);
      expect(boundary.broadcast).not.toHaveBeenCalled();
    });
  }
  it.each(outcomes.slice(0, 2))('cannot replace stored $status with a stale pending writer', next => {
    saveReceipt(next);
    saveReceipt(pending);
    expect(loadReceipts()[0]).toEqual(next);
  });
  it('reflects same-status prop updates even without persistence', () => {
    const view = render(<TransactionResult receipt={pending} />);
    view.rerender(<TransactionResult receipt={outcomes[2]} />);
    expect(screen.getByRole('status').textContent).toContain(outcomes[2].message);
    expect(screen.getByText(outcomes[2].feeWarning!)).toBeTruthy();
  });
  it('shows a late real CheckTx rejection after opening the broadcast pending record', async () => {
    const broadcast = deferred<never>();
    boundary.broadcast.mockReturnValue(broadcast.promise);
    const sending = submitSendTx(await prepareSendTx(input));
    await waitFor(() => expect(boundary.broadcast).toHaveBeenCalledOnce());
    render(<SavedTransactions chainKey="a" />);
    fireEvent.click(screen.getByText(/보관된 거래 결과/));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(hash) }));
    await act(async () => {
      broadcast.reject(new BroadcastTxError(5, 'sdk', 'rejected checktx'));
      await sending;
    });
    expect(screen.getByRole('status').textContent).toContain('rejected checktx · code 5');
    detailFailure = true;
    fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await screen.findByText(/거래 상세 재조회 실패/);
    expect(loadReceipts()[0]).toMatchObject({ status: 'failed', code: 5, hash, message: 'rejected checktx' });
    expect(boundary.broadcast).toHaveBeenCalledOnce();
  });
  it('reconciles an in-flight service lookup with newer stored evidence without a mounted UI', async () => {
    const lookup = deferred<Response>();
    http.mockImplementation(async url => String(url).includes('/txs/') ? lookup.promise : response(String(url)));
    saveReceipt(pending);
    const reading = queryReceipt(pending);
    await waitFor(() => expect(http.mock.calls.some(([url]) => String(url).includes('/txs/'))).toBe(true));
    saveReceipt(outcomes[0]);
    lookup.resolve(response(`https://a.test:1317/cosmos/tx/v1beta1/txs/${hash}`));
    expect(await reading).toEqual(outcomes[0]);
  });
  it('preserves timeout text on lookup failure and clears only the query error on recovery', async () => {
    await openPending();
    act(() => { saveReceipt(outcomes[2]); });
    detailFailure = true;
    fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await screen.findByText(/거래 상세 재조회 실패/);
    expect(loadReceipts()[0]).toMatchObject(outcomes[2]);
    detailFailure = false;
    fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await screen.findByText(/체인 포함 성공/);
    await waitFor(() => expect(screen.queryByText(/거래 상세 재조회 실패/)).toBeNull());
    expect(loadReceipts()[0].queryError).toBeUndefined();
  });
  it('discards related-read errors if a newer receipt arrives while those reads run', async () => {
    const related = deferred<Response>();
    http.mockImplementation(async url => new URL(String(url)).pathname.endsWith('/txs') ? related.promise : response(String(url)));
    await openPending();
    fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await waitFor(() => expect(http.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith('/txs'))).toBe(true));
    const next = { ...outcomes[1], feeWarning: '최신 수수료 경고' };
    act(() => { saveReceipt(next); });
    await act(async () => { related.resolve(new Response('', { status: 503 })); });
    expect(screen.getByText(next.feeWarning)).toBeTruthy();
    expect(screen.queryByText(/거래 성공 후 화면 갱신 실패/)).toBeNull();
    expect(loadReceipts()[0]).toEqual(next);
  });
  it('does not commit an old lookup after the result has unmounted', async () => {
    const lookup = deferred<Response>();
    http.mockImplementation(async url => String(url).includes('/txs/') ? lookup.promise : response(String(url)));
    await openPending();
    fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await waitFor(() => expect(http.mock.calls.some(([url]) => String(url).includes('/txs/'))).toBe(true));
    cleanup();
    await act(async () => { lookup.resolve(response(`https://a.test:1317/cosmos/tx/v1beta1/txs/${hash}`)); });
    expect(loadReceipts()[0]).toEqual(pending);
  });
  it.each(outcomes.slice(0, 2))('preserves an unsaved $status outcome against stale stored and prop pending values', async next => {
    saveReceipt(pending);
    detailFailure = true;
    const view = render(<TransactionResult receipt={next} />);
    await screen.findByText(/거래 상세 재조회 실패/);
    view.rerender(<TransactionResult receipt={pending} />);
    expect(screen.getByRole('status').textContent).toContain(next.message);
    expect(loadReceipts()[0]).toMatchObject(next);
  });
});
afterEach(() => { window.history.replaceState(null, '', '/'); cleanup(); store.getState().disconnect(); delete window.keplr; delete window.getOfflineSigner; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function fill() {
  render(<SendForm />);
  fireEvent.change(screen.getByLabelText('수신 주소'), { target: { value: recipient } });
  fireEvent.change(screen.getByLabelText('수량 (표시 단위)'), { target: { value: '1.234567' } });
  await screen.findByText('표시 수량 1.234567 GXN → 전송 원본 1234567 agxn');
  fireEvent.click(screen.getByRole('checkbox'));
}
async function confirmDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Send Tx' }));
  return screen.findByRole('dialog');
}
async function executeUi() { await fill(); const dialog = await confirmDialog(); fireEvent.click(within(dialog).getByRole('button', { name: '확인하고 지갑 서명' })); }

describe('GURA-57 recipient validation through actual form and preparation', () => {
  const reportedAddress = 'guru12yx8z0fzv27x3jx57yk0h8rlvwarp6y4zd00us';
  it.each(['development-preset', 'missing-prefix'])('keeps a valid address neutral and blocks writes for %s', async mode => {
    if (mode === 'development-preset') {
      for (const key of Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_'))) vi.stubEnv(key, undefined);
      vi.stubEnv('NODE_ENV', 'development');
      store.getState().connect('keplr', sender, null, { chainKey: 'tgxn', chainId: 'guru_631-1', pubkey });
      expect(getActiveChainConfig().key).toBe('tgxn');
    } else configure({ bech32Prefix: undefined });
    expect(getActiveChainConfig().bech32Prefix).toBeUndefined();
    render(<SendForm />);
    fireEvent.change(screen.getByLabelText('수신 주소'), { target: { value: reportedAddress } });
    expect(screen.getByLabelText('수신 주소').getAttribute('aria-invalid')).toBe('false');
    expect(screen.getByText(/선택 체인의 주소 prefix가 확인되지 않아/)).toBeTruthy();
    expect(screen.getByText(/검증 정보가 부족하여 조회만 가능합니다/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send Tx' }) as HTMLButtonElement).disabled).toBe(true);
    await expect(prepareSendTx({ ...input, toAddress: reportedAddress })).rejects.toThrow('검증 정보가 부족');
    expect(window.getOfflineSigner).not.toHaveBeenCalled();
    expect(boundary.sign).not.toHaveBeenCalled();
    expect(boundary.wallet).not.toHaveBeenCalled();
    expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('prepares the reported address with verified synthetic settings without signing', async () => {
    await fill();
    fireEvent.change(screen.getByLabelText('수신 주소'), { target: { value: reportedAddress } });
    expect(screen.getByLabelText('수신 주소').getAttribute('aria-invalid')).toBe('false');
    const dialog = await confirmDialog();
    expect(within(dialog).getByText(`전체 수신 주소: ${reportedAddress}`)).toBeTruthy();
    const prepared = await prepareSendTx({ ...input, toAddress: reportedAddress });
    expect(prepared.snapshot.recipient).toBe(reportedAddress);
    prepared.cancel();
    expect(boundary.wallet).not.toHaveBeenCalled();
    expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  const invalidAddresses = [
    ['prefix', bech32.encode('cosmos', bech32.toWords(new Uint8Array(20)))],
    ['checksum', reportedAddress.slice(0, -1) + 'q'],
    ['short-payload', bech32.encode('guru', bech32.toWords(new Uint8Array(19)))],
    ['32-byte-payload', bech32.encode('guru', bech32.toWords(new Uint8Array(32)))],
  ];
  it.each(invalidAddresses)('rejects %s in both the form and service', async (_kind, address) => {
    await fill();
    fireEvent.change(screen.getByLabelText('수신 주소'), { target: { value: address } });
    expect(screen.getByLabelText('수신 주소').getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByRole('button', { name: 'Send Tx' }) as HTMLButtonElement).disabled).toBe(true);
    await expect(prepareSendTx({ ...input, toAddress: address })).rejects.toThrow('수신 주소');
    expect(boundary.simulate).not.toHaveBeenCalled();
    expect(boundary.wallet).not.toHaveBeenCalled();
    expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it.each(invalidAddresses.slice(1))('still marks malformed %s as an input error without a chain prefix', (_kind, address) => {
    configure({ bech32Prefix: undefined }); render(<SendForm />);
    fireEvent.change(screen.getByLabelText('수신 주소'), { target: { value: address } });
    expect(screen.getByLabelText('수신 주소').getAttribute('aria-invalid')).toBe('true');
  });
  it('rejects an already prepared snapshot when the configured prefix is removed', async () => {
    const prepared = await prepareSendTx(input);
    configure({ bech32Prefix: undefined });
    await expect(submitSendTx(prepared)).rejects.toThrow('변경');
    expect(boundary.wallet).not.toHaveBeenCalled();
    expect(boundary.broadcast).not.toHaveBeenCalled();
  });
});

describe('W05 actual UI → prepared snapshot → MsgSend → chain result', () => {
  it('shows every confirmation field without a signing prompt, focuses cancel, Escape restores the trigger and broadcasts zero', async () => {
    const user = userEvent.setup(); await fill();
    const trigger = screen.getByRole('button', { name: 'Send Tx' }); await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    for (const text of ['행위: 송금', '체인: a / a-1', `서명 계정: ${sender}`, `전체 수신 주소: ${recipient}`, '표시 수량: 1.234567 GXN', '전송 원본: 1234567 agxn', '예상 수수료 (최소 단위): 130 agxn']) expect(within(dialog).getByText(text)).toBeTruthy();
    expect(within(dialog).getByText(/simulate gas 100000/)).toBeTruthy();
    expect(window.getOfflineSigner).not.toHaveBeenCalled(); expect(boundary.wallet).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '취소' })));
    await user.keyboard('{Escape}'); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('double click produces one sign/broadcast, exact message + fee, chain link, actual fee and three refresh paths', async () => {
    await fill(); const dialog = await confirmDialog(); const button = within(dialog).getByRole('button', { name: '확인하고 지갑 서명' });
    fireEvent.click(button); fireEvent.click(button);
    await screen.findByText(/체인 포함 성공/);
    await waitFor(() => expect(portfolio.getState().result.status).toBe('success'));
    expect(boundary.sign).toHaveBeenCalledTimes(1); expect(boundary.broadcast).toHaveBeenCalledTimes(1);
    expect(boundary.sign.mock.calls[0]).toEqual([sender, [{ typeUrl: '/cosmos.bank.v1beta1.MsgSend', value: { fromAddress: sender, toAddress: recipient, amount: [{ amount: '1234567', denom: 'agxn' }] } }], { gas: '130000', amount: [{ amount: '130', denom: 'agxn' }] }, '']);
    expect((await screen.findByRole('link', { name: /거래 상세/ })).getAttribute('href')).toBe(`/tx/${hash}?chain=a`);
    await screen.findByText('실제 체인 수수료: 130 agxn');
    const paths = http.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths.filter(p => p.includes('/balances/')).length).toBeGreaterThanOrEqual(3);
    expect(paths).toContain('/cosmos/tx/v1beta1/txs'); expect(paths).toContain(`/cosmos/tx/v1beta1/txs/${hash}`);
  });
  it('wallet rejection is cancellation with zero broadcasts', async () => {
    boundary.wallet.mockRejectedValue(new Error('Request rejected by user')); await executeUi();
    await screen.findByText('지갑 서명이 취소되었습니다. 전송하지 않았습니다.'); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it.each(['수신 주소', '수량 (표시 단위)', 'Denom'])('editing %s invalidates the app approval, including returning to the old input', async label => {
    await fill(); await confirmDialog();
    const inputField = screen.getByLabelText(label); const original = (inputField as HTMLInputElement).value;
    fireEvent.change(inputField, { target: { value: label === '수신 주소' ? sender : label === 'Denom' ? 'uother' : '2' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.change(inputField, { target: { value: original } });
    expect(screen.queryByRole('dialog')).toBeNull(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it.each(['account', 'chain', 'disconnect'])('%s during confirmation discards the old snapshot', async change => {
    await fill(); await confirmDialog();
    act(() => { if (change === 'chain') setActiveChainKeyCookie('b'); else if (change === 'disconnect') store.getState().disconnect(); else connect(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it.each(['account', 'chain', 'input'])('%s while signing prevents broadcast of the late signature', async change => {
    const pending = deferred<unknown>(); boundary.wallet.mockReturnValue(pending.promise); await executeUi();
    await waitFor(() => expect(boundary.wallet).toHaveBeenCalledOnce());
    act(() => { if (change === 'chain') setActiveChainKeyCookie('b'); else if (change === 'account') connect(); else fireEvent.change(screen.getByLabelText('수신 주소'), { target: { value: sender } }); });
    await act(async () => { pending.resolve({ signed: SignDoc.fromPartial({ chainId: 'a-1' }) }); });
    expect(boundary.broadcast).not.toHaveBeenCalled(); expect(screen.queryByText(/체인 포함 성공/)).toBeNull();
  });
  it.each(['input', 'chain', 'account'])('a late simulation after %s change cannot create a confirmation', async change => {
    const pending = deferred<number>(); boundary.simulate.mockReturnValue(pending.promise); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Send Tx' }));
    await waitFor(() => expect(boundary.simulate).toHaveBeenCalled());
    act(() => { if (change === 'chain') { setActiveChainKeyCookie('b'); setActiveChainKeyCookie('a'); } else if (change === 'account') connect(); else fireEvent.change(screen.getByLabelText('수신 주소'), { target: { value: sender } }); });
    await act(async () => { pending.resolve(100000); }); expect(screen.queryByRole('dialog')).toBeNull(); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('code != 0 preserves hash and log without a success message', async () => {
    txStatus = 5; boundary.broadcast.mockResolvedValue({ code: 5, transactionHash: hash, rawLog: 'insufficient funds' }); await executeUi();
    await screen.findByText(/insufficient funds/); expect(screen.queryByText(/체인 포함 성공/)).toBeNull(); expect((await screen.findByRole('link', { name: /거래 상세/ }))).toBeTruthy();
  });
  it('timeout persists chain+hash, reload supports lookup, never resends, and reads the original chain after switching', async () => {
    detailFailure = true; boundary.broadcast.mockRejectedValue(new Error('Timeout waiting for inclusion')); await executeUi();
    await screen.findByText(/확인 중 · Timeout/); expect(loadReceipts()[0]).toMatchObject({ hash, chainKey: 'a', status: 'pending' });
    cleanup(); act(() => setActiveChainKeyCookie('b')); detailFailure = false;
    render(<TransactionResult receipt={loadReceipts()[0]} />); fireEvent.click(await screen.findByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await screen.findByText(/체인 포함 성공/); expect(boundary.broadcast).toHaveBeenCalledTimes(1);
    const reads = http.mock.calls.filter(([url]) => String(url).includes(`/txs/${hash}`)); expect(reads.every(([url]) => String(url).startsWith('https://a.test'))).toBe(true);
  });
  it('successful inclusion and partial refresh failure remain separate and a retry repairs the view', async () => {
    addressFailure = true; await executeUi(); await screen.findByText(/거래 성공 후 화면 갱신 실패/);
    expect(screen.getByText(/체인 포함 성공/)).toBeTruthy(); addressFailure = false;
    fireEvent.click(await screen.findByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await waitFor(() => expect(screen.queryByText(/거래 성공 후 화면 갱신 실패/)).toBeNull()); expect(boundary.broadcast).toHaveBeenCalledTimes(1);
  });
  it('fee change is shown using raw chain fee; missing fee remains unknown', async () => {
    actualFee = [{ denom: 'agxn', amount: '999' }]; await executeUi(); await screen.findByText('실제 체인 수수료: 999 agxn');
    expect(screen.getByText('실제 체인 수수료가 앱 예상 수수료와 다릅니다.')).toBeTruthy();
    actualFee = undefined; fireEvent.click(await screen.findByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await screen.findByText('실제 수수료 원문 미조회 또는 형식 불일치'); expect(screen.getByText('실제 체인 수수료: 미조회')).toBeTruthy();
  });
});

describe('W05 preflight and execution contracts', () => {
  it.each([6, 18])('%d decimals preserve huge integers and the minimum unit', async decimals => {
    configure({ decimals });
    for (const amount of ['1', displayToBase('9007199254740993.123456', decimals)]) {
      const prepared = await prepareSendTx({ ...input, amount, displayAmount: undefined }); await submitSendTx(prepared);
      expect(boundary.sign.mock.calls.at(-1)![1][0].value.amount[0].amount).toBe(amount);
    }
  });
  it.each(['invalid', 'prefix', 'length'])('rejects %s recipient before a signer', async kind => {
    const toAddress = kind === 'invalid' ? 'guru1bad' : bech32.encode(kind === 'prefix' ? 'cosmos' : 'guru', bech32.toWords(new Uint8Array(kind === 'length' ? 10 : 20)));
    await expect(prepareSendTx({ ...input, toAddress })).rejects.toThrow('수신 주소'); expect(boundary.connect).not.toHaveBeenCalled();
  });
  it.each(['missing-policy', 'wrong-fee-denom', 'no-signing', 'bank-disabled'])('blocks %s rather than inventing support', async kind => {
    configure(kind === 'missing-policy' ? { sendFeePolicy: undefined } : kind === 'wrong-fee-denom' ? { feeDenom: 'uother' } : kind === 'no-signing' ? { signing: undefined } : { features: { bank: false } });
    await expect(prepareSendTx(input)).rejects.toThrow(); expect(boundary.wallet).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('keeps the TGXN default unverified write gate', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ key: 'tgxn', name: 'TGXN', lcdUrl: 'https://tgxn.gurufin.io:1317' }])); vi.stubEnv('NEXT_PUBLIC_DEFAULT_CHAIN_KEY', 'tgxn');
    await expect(prepareSendTx(input)).rejects.toThrow(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('failed simulation blocks without a fallback and a documented fallback is displayed', async () => {
    boundary.simulate.mockRejectedValue(new Error('RPC simulate unavailable'));
    await expect(prepareSendTx(input)).rejects.toThrow('수수료 추정 실패');
    configure({ sendFeePolicy: { mode: 'simulate', gasPrice: '0.001agxn', gasMultiplierBps: 13000, evidence: 'synthetic', fallback: { gas: 220000, evidence: 'synthetic verified fallback' } } });
    const prepared = await prepareSendTx(input); expect(prepared.snapshot.fee.amount).toEqual([{ amount: '220', denom: 'agxn' }]); expect(prepared.snapshot.feeBasis).toContain('synthetic verified fallback');
    expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('same fee asset requires amount plus fee, distinct fee asset is checked separately, and a fresh balance is read before sign', async () => {
    balances = [{ denom: 'agxn', amount: '1234567' }]; await expect(prepareSendTx(input)).rejects.toThrow('잔액이 부족');
    configure({ feeDenom: 'uother', sendFeePolicy: { mode: 'fixed', gasPrice: '0.001uother', gas: 100000, evidence: 'synthetic', limitation: 'synthetic' } });
    await expect(prepareSendTx(input)).rejects.toThrow('uother 잔액이 부족');
    balances.push({ denom: 'uother', amount: '100' }); const prepared = await prepareSendTx(input);
    balances[1].amount = '99'; await expect(submitSendTx(prepared)).rejects.toThrow('잔액이 부족'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('a snapshot is one-use and parallel snapshots cannot double-submit the same account', async () => {
    const first = await prepareSendTx(input); const second = await prepareSendTx(input); const pending = deferred<unknown>(); boundary.wallet.mockReturnValue(pending.promise);
    const running = submitSendTx(first); await waitFor(() => expect(boundary.wallet).toHaveBeenCalled());
    await expect(submitSendTx(second)).rejects.toThrow('이미 처리'); await expect(submitSendTx(first)).rejects.toThrow('이미 처리');
    pending.resolve({ signed: SignDoc.fromPartial({ chainId: 'a-1' }) }); await running; expect(boundary.broadcast).toHaveBeenCalledTimes(1);
  });
  it('cancel invalidates a prepared service snapshot', async () => {
    const prepared = await prepareSendTx(input); prepared.cancel(); await expect(submitSendTx(prepared)).rejects.toThrow('다시 확인'); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('node CheckTx rejection has code/hash and is not reported as success', async () => {
    boundary.broadcast.mockRejectedValue(new BroadcastTxError(5, 'sdk', 'rejected checktx')); const result = await submitSendTx(await prepareSendTx(input));
    expect(result).toMatchObject({ status: 'failed', code: 5, hash, message: 'rejected checktx' });
  });
  it('late broadcast outcome remains stored on its original chain and never appears as the new account result', async () => {
    const pending = deferred<unknown>(); boundary.broadcast.mockReturnValue(pending.promise); await executeUi(); await waitFor(() => expect(boundary.broadcast).toHaveBeenCalled());
    act(() => { setActiveChainKeyCookie('b'); store.getState().disconnect(); });
    await act(async () => { pending.resolve({ code: 0, transactionHash: hash }); });
    expect(loadReceipts()[0]).toMatchObject({ chainKey: 'a', status: 'success' }); expect(screen.queryByText('체인 포함 성공')).toBeNull();
  });
  it('malformed/mismatched detail never manufactures success or a zero actual fee', async () => {
    const pending: TransactionReceipt = { chainKey: 'a', chainId: 'a-1', sender, hash, status: 'pending', message: '확인 중', estimatedFee: [], actualFee: null };
    for (const raw of [{ tx_response: { txhash: hash, height: '1' } }, { tx_response: { txhash: 'F'.repeat(64), code: 0, height: '1' } }]) {
      http.mockImplementation(async url => String(url).includes('/txs/') ? Response.json(raw) : response(String(url)));
      expect(await queryReceipt(pending)).toMatchObject({ status: 'pending', actualFee: null });
    }
  });
  it('a hashless ambiguous result explicitly states the limitation', async () => {
    render(<TransactionResult receipt={{ chainKey: 'a', chainId: 'a-1', sender, hash: null, status: 'pending', message: '확인 중', estimatedFee: [], actualFee: null }} />);
    expect(screen.getByText(/해시가 없어 결과가 불명확/)).toBeTruthy(); expect(screen.queryByRole('link')).toBeNull();
  });
  it('chain+hash link pins the actual detail query even when the cookie selects another chain', async () => {
    setActiveChainKeyCookie('b'); window.history.replaceState(null, '', '/tx/' + hash + '?chain=a'); render(<ExplorerShell><TxPage /></ExplorerShell>); await screen.findByText('트랜잭션 상세');
    expect(http.mock.calls.some(([url]) => String(url) === `https://a.test:1317/cosmos/tx/v1beta1/txs/${hash}`)).toBe(true);
    expect(getActiveChainConfig().key).toBe('a'); expect(transactionLink({ chainKey: 'a', hash })).toBe(`/tx/${hash}?chain=a`);
  });
  it('an unknown chain link blocks instead of querying the selected cookie chain', () => {
    boundary.search = 'unknown'; window.history.replaceState(null, '', '/tx/' + hash + '?chain=unknown'); render(<ExplorerShell><TxPage /></ExplorerShell>); expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('설정이 없습니다'))).toBe(true); expect(http).not.toHaveBeenCalled();
  });
  it('saved pending results can be inspected after reload without reconnecting a wallet', async () => {
    saveReceipt({ chainKey: 'a', chainId: 'a-1', sender, hash, status: 'pending', message: '확인 중', estimatedFee: [], actualFee: null });
    store.getState().disconnect(); render(<SavedTransactions chainKey="a" />);
    fireEvent.click(screen.getByText(/보관된 거래 결과/));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(hash) }));
    fireEvent.click(await screen.findByRole('button', { name: '거래 상태·관련 조회 다시 읽기' }));
    await screen.findByText(/체인 포함 성공/); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it.each(['new-object', 'mutated-document'])('a wallet-modified message body (%s) cannot be broadcast', async mode => {
    boundary.wallet.mockImplementation(async (_sender, doc: SignDoc) => {
      if (mode === 'mutated-document') { doc.bodyBytes = new Uint8Array([1]); return { signed: doc }; }
      return { signed: SignDoc.fromPartial({ chainId: 'a-1', bodyBytes: new Uint8Array([1]) }) };
    });
    await expect(submitSendTx(await prepareSendTx(input))).rejects.toThrow('거래 본문을 변경');
    expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('the prepared input is immutable even when its caller mutates the original object', async () => {
    const original = { ...input }; const prepared = await prepareSendTx(original); original.amount = '1'; original.toAddress = sender;
    await submitSendTx(prepared); expect(boundary.sign.mock.calls[0][1][0].value).toMatchObject({ toAddress: recipient, amount: [{ amount: '1234567', denom: 'agxn' }] });
  });
  it('expired confirmation requires new fee and balance verification', async () => {
    const prepared = await prepareSendTx(input); const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 120001);
    try { await expect(submitSendTx(prepared)).rejects.toThrow('2분'); } finally { clock.mockRestore(); }
    expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('different fee and transfer assets submit the exact fee coin after separate balance validation', async () => {
    configure({ feeDenom: 'uother', sendFeePolicy: { mode: 'fixed', gasPrice: '0.001uother', gas: 100000, evidence: 'synthetic', limitation: 'synthetic only' } });
    balances = [{ denom: 'agxn', amount: '1234567' }, { denom: 'uother', amount: '100' }];
    await submitSendTx(await prepareSendTx(input)); expect(boundary.sign.mock.calls[0][2]).toEqual({ gas: '100000', amount: [{ denom: 'uother', amount: '100' }] });
  });
  it('stored results contain no session, signature or public key, and corrupt storage is ignored', () => {
    saveReceipt({ chainKey: 'a', chainId: 'a-1', sender, hash, status: 'pending', message: '확인 중', estimatedFee: [], actualFee: null });
    expect(Object.keys(loadReceipts()[0])).not.toContain('sessionTopic'); localStorage.setItem('explorer:transaction-receipts:v1', '{'); expect(loadReceipts()).toEqual([]);
  });
});
