// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bech32 } from 'bech32';
import { sha256 } from '@cosmjs/crypto';
import { Registry, type OfflineDirectSigner } from '@cosmjs/proto-signing';
import { AminoTypes, BroadcastTxError, createDefaultAminoConverters, defaultRegistryTypes } from '@cosmjs/stargate';
import { SignDoc, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { MsgSubmitProposal, MsgExecLegacyContent, MsgVote, MsgDeposit } from 'cosmjs-types/cosmos/gov/v1/tx';
import { TextProposal } from 'cosmjs-types/cosmos/gov/v1beta1/gov';
import type { ChainConfig } from '@/lib/env';
import { getActiveChainConfig, setActiveChainKeyCookie } from '@/lib/chain-selection';
import { displayToBase } from '@/lib/cosmos-amount';
import { useWalletSessionStore as store } from '@/stores/wallet-session.store';
import { useWalletPortfolioStore as portfolio } from '@/stores/wallet-portfolio.store';
import { prepareGovernanceTx, governanceMessages, type GovernanceTxInput } from '@/services/guru/governance-tx.client';
import type { GovernanceAction } from '@/services/transactions/transaction';
import { loadReceipts, saveReceipt, queryReceipt, proposalIdFromTx, refreshTransactionReads } from '@/services/transactions/receipt';
import { SavedTransactions, TransactionResult } from '@/components/transactions/transaction-result';
import { GovernanceNewProposalForm } from '@/components/governance/governance-new-proposal-form';
import GovernanceProposalPage from '@/app/(explorer)/governance/[proposalId]/page';
import GovernancePage from '@/app/(explorer)/governance/page';
import { prepareSendTx } from '@/services/guru/bank-tx.client';
import { prepareStakingTx, stakingMessages } from '@/services/guru/staking-tx.client';

const boundary = vi.hoisted(() => ({ connect: vi.fn(), simulate: vi.fn(), sign: vi.fn(), broadcast: vi.fn(), wallet: vi.fn(), id: '9007199254740993', chain: '' }));
vi.mock('@cosmjs/stargate', async original => ({ ...await original<typeof import('@cosmjs/stargate')>(), SigningStargateClient: { connectWithSigner: boundary.connect } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ proposalId: boundary.id }), useSearchParams: () => new URLSearchParams(boundary.chain ? { chain: boundary.chain } : {}) }));
const sender = bech32.encode('guru', bech32.toWords(new Uint8Array(20).fill(1)));
const authority = bech32.encode('guru', bech32.toWords(new Uint8Array(20).fill(2)));
const validator = bech32.encode('guruvaloper', bech32.toWords(new Uint8Array(20).fill(1)));
const pubkey = new Uint8Array(33).fill(3);
const signed = { bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), signatures: [] };
const hash = Array.from(sha256(TxRaw.encode(signed).finish()), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
const fee = { mode: 'simulate' as const, gasPrice: '0.001agxn', gasMultiplierBps: 13000, evidence: 'synthetic fixture only' };
const signing = [{ wallet: 'keplr' as const, method: 'direct' as const, evidence: 'synthetic fixture only' }];
const a: ChainConfig = { key: 'a', name: 'A', chainId: 'a-1', lcdUrl: 'https://a.test:1317', rpcUrl: 'https://a.test:26657',
  nativeDenom: 'agxn', bondDenom: 'agxn', feeDenom: 'agxn', bech32Prefix: 'guru', decimals: 6, signing,
  rpcAccess: { origin: 'http://localhost:3000', get: true, post: true, options: true, observedAt: '2026-10-20', evidence: 'synthetic only' },
  features: { governance: true, staking: true, distribution: true },
  governanceCapabilities: {
    vote: { ...governanceMessages.vote, signing, fee, evidence: 'synthetic only' },
    deposit: { ...governanceMessages.deposit, signing, fee, evidence: 'synthetic only' },
    proposal: { ...governanceMessages.proposal, signing, fee, evidence: 'synthetic only', legacyContent: { authority, evidence: 'synthetic handler only; no live support assertion' } },
  },
  sendFeePolicy: fee,
  stakingCapabilities: { delegate: { ...stakingMessages.delegate, signing, fee, evidence: 'synthetic only' } },
};
const b = { ...a, key: 'b', name: 'B', chainId: 'b-1', lcdUrl: 'https://b.test:1317', rpcUrl: 'https://b.test:26657' };
const originalId = '9007199254740993';
const newId = '9007199254741001';
let status: string;
let deadline: string;
let start: string;
let minimum: string;
let paramsVersion: string;
let moduleAddress: string;
let balances: { amount: string; denom: string }[];
let http: ReturnType<typeof vi.fn<typeof fetch>>;
let txStatus: number;
let actualFee: unknown;
let events: unknown;
let queryFailure: string;
let included: boolean;
let mounted: ReturnType<typeof render>;
function configure(overrides: Partial<ChainConfig> = {}) {
  vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ ...a, ...overrides }, b])); vi.stubEnv('NEXT_PUBLIC_DEFAULT_CHAIN_KEY', 'a');
}
function connect() { store.getState().connect('keplr', sender, null, { chainKey: 'a', chainId: 'a-1', pubkey }); store.setState({ writeStatus: 'ready', writeReason: null }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(res => { resolve = res; }); return { promise, resolve }; }
function rawProposal(id = originalId) {
  return { id, title: included ? 'Updated proposal' : 'Current proposal', summary: 'Current summary', status,
    deposit_end_time: deadline, voting_start_time: start, voting_end_time: deadline, submit_time: start,
    total_deposit: [{ denom: 'agxn', amount: included ? '2234567' : '1000000' }],
    final_tally_result: { yes_count: '0', abstain_count: '0', no_count: '0', no_with_veto_count: '0' } };
}
function rawTx() { return { tx_response: { txhash: hash, code: txStatus, height: '123', raw_log: txStatus ? 'chain failure' : '', events },
  tx: { body: { messages: [{ '@type': governanceMessages.proposal.typeUrl, proposer: sender }] }, auth_info: { fee: { amount: actualFee } } } }; }
function response(input: string): Response {
  const url = new URL(input); const path = url.pathname; const chainId = url.hostname === 'b.test' ? 'b-1' : 'a-1';
  if (queryFailure && path.endsWith(queryFailure)) return new Response('', { status: 503 });
  if (url.port === '26657') return Response.json({ result: { node_info: { network: chainId } } });
  if (path.endsWith('/node_info')) return Response.json({ default_node_info: { network: chainId } });
  if (path.endsWith('/denoms_metadata')) return Response.json({ metadatas: ['agxn', 'uother'].map(denom => ({ base: denom, display: 'display', symbol: denom === 'agxn' ? 'GXN' : 'OTHER', denom_units: [{ denom, exponent: 0 }, { denom: 'display', exponent: getActiveChainConfig().decimals }] })) });
  if (path.includes('/spendable_balances/') || path.includes('/balances/')) return Response.json({ balances });
  if (path.endsWith('/module_accounts')) return Response.json({ accounts: [{ name: 'gov', base_account: { address: moduleAddress } }] });
  if (path.includes('/auth/')) return Response.json({ account: { account_number: '1', sequence: '0' } });
  if (path.endsWith('/params/deposit')) return Response.json({ deposit_params: { min_deposit: [{ denom: 'agxn', amount: minimum }], max_deposit_period: '100s', min_initial_deposit_ratio: paramsVersion } });
  if (path.endsWith('/params/voting')) return Response.json({ voting_params: { voting_period: '100s' } });
  if (path.endsWith('/params/tallying')) return Response.json({ tally_params: { quorum: '0.3', threshold: '0.5', veto_threshold: '0.33' } });
  if (path.endsWith('/proposals')) return Response.json({ proposals: included ? [rawProposal(newId), rawProposal()] : [rawProposal()] });
  if (path.includes('/proposals/') && path.endsWith('/tally')) return Response.json({ tally: { yes_count: included ? '900' : '0', abstain_count: '0', no_count: '0', no_with_veto_count: '0' } });
  if (path.includes('/proposals/') && path.endsWith('/votes')) return Response.json({ votes: included ? [{ voter: sender, options: [{ option: 'VOTE_OPTION_YES' }] }] : [] });
  if (path.includes('/proposals/') && path.endsWith('/deposits')) return Response.json({ deposits: included ? [{ depositor: sender, amount: [{ denom: 'agxn', amount: '1234567' }] }] : [] });
  if (path.includes('/proposals/') && path.includes('/votes/')) return Response.json({ vote: { options: [{ option: included ? 'VOTE_OPTION_YES' : 'VOTE_OPTION_ABSTAIN' }] } });
  if (path.includes('/proposals/')) return Response.json({ proposal: rawProposal(path.split('/').at(-1)) });
  if (path.endsWith('/txs')) return Response.json({ tx_responses: [], txs: [] });
  if (path.includes('/txs/')) return Response.json(rawTx());
  if (path.endsWith('/staking/v1beta1/params')) return Response.json({ params: { bond_denom: 'agxn', unbonding_time: '100s' } });
  if (path.endsWith(`/validators/${validator}`)) return Response.json({ validator: { operator_address: validator, jailed: false, status: 'BOND_STATUS_BONDED' } });
  if (path.endsWith('/rewards')) return Response.json({ total: [] });
  if (path.includes('/unbonding_delegations')) return Response.json({ unbonding_responses: [] });
  if (path.includes('/delegations/')) return Response.json({ delegation_responses: [] });
  throw new Error(`Unexpected HTTP ${path}`);
}
beforeEach(() => {
  vi.clearAllMocks(); document.cookie = 'gf_chain=; max-age=0; path=/'; localStorage.clear(); configure(); connect();
  boundary.id = originalId; boundary.chain = '';
  status = 'PROPOSAL_STATUS_VOTING_PERIOD'; start = '2000-01-01T00:00:00Z'; deadline = '2099-01-01T00:00:00Z'; minimum = '1'; paramsVersion = '0.1'; moduleAddress = authority;
  balances = [{ denom: 'agxn', amount: '999999999999999999999999999999999999999999999' }];
  txStatus = 0; actualFee = [{ denom: 'agxn', amount: '130' }]; events = [{ type: 'submit_proposal', attributes: [{ key: 'proposal_id', value: newId }] }]; queryFailure = ''; included = false;
  http = vi.fn<typeof fetch>(async url => response(String(url))); vi.stubGlobal('fetch', http);
  window.keplr = { enable: vi.fn().mockResolvedValue(undefined) };
  boundary.wallet.mockImplementation(async (_sender, doc) => ({ signed: doc, signature: { signature: '', pub_key: { type: '', value: '' } } }));
  window.getOfflineSigner = vi.fn(() => ({ getAccounts: async () => [{ address: sender, pubkey, algo: 'secp256k1' }], signDirect: boundary.wallet }));
  boundary.simulate.mockResolvedValue(100000);
  boundary.broadcast.mockImplementation(async () => { included = true; return { code: 0, transactionHash: hash, rawLog: '' }; });
  boundary.connect.mockImplementation(async (_rpc, signer: OfflineDirectSigner) => ({
    simulate: async (...args: unknown[]) => { await signer.getAccounts(); return boundary.simulate(...args); },
    sign: async (...args: unknown[]) => { boundary.sign(...args); await signer.signDirect(sender, SignDoc.fromPartial({ chainId: getActiveChainConfig().chainId! })); return signed; },
    broadcastTx: boundary.broadcast, disconnect: vi.fn(),
  }));
});
afterEach(() => { cleanup(); store.getState().disconnect(); portfolio.getState().clear(); delete window.keplr; delete window.getOfflineSigner; vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const actions = ['vote', 'deposit', 'proposal'] as const;
function input(action: GovernanceAction): GovernanceTxInput {
  if (action === 'deposit') status = 'PROPOSAL_STATUS_DEPOSIT_PERIOD';
  const base = { walletType: 'keplr' as const, sessionTopic: null, bech32Address: sender };
  return action === 'vote' ? { ...base, action, proposalId: originalId, option: 'yes' }
    : action === 'deposit' ? { ...base, action, proposalId: originalId, amount: '1234567', denom: 'agxn', displayAmount: '1.234567' }
    : { ...base, action, title: 'Title', summary: 'Summary', description: 'Details', amount: '1234567', denom: 'agxn', displayAmount: '1.234567' };
}
async function open(action: GovernanceAction) {
  input(action);
  if (action === 'proposal') {
    mounted = render(<GovernanceNewProposalForm defaultDenom="agxn" />);
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText(/요약/), { target: { value: 'Summary' } });
    fireEvent.change(screen.getByLabelText(/상세 설명/), { target: { value: 'Details' } });
  } else { mounted = render(<GovernanceProposalPage />); await screen.findByText(`제안 #${originalId}`); }
  if (action !== 'vote') {
    fireEvent.change(screen.getByLabelText(action === 'deposit' ? '수량 (표시 단위)' : '초기 예치 (표시 단위)'), { target: { value: '1.234567' } });
    await screen.findByText('표시 수량 1.234567 GXN → 전송 원본 1234567 agxn'); fireEvent.click(screen.getByRole('checkbox'));
  }
  const trigger = screen.getByRole('button', { name: action === 'vote' ? 'Yes' : action === 'deposit' ? '예치 전송' : '제안 전송' }); trigger.focus(); fireEvent.click(trigger);
  return screen.findByRole('dialog');
}
async function approve() { fireEvent.click(await screen.findByRole('button', { name: '확인하고 지갑 서명' })); }

describe.each(actions)('W07 %s real UI/service/signer guards/HTTP refresh', action => {
  it('confirms full context, duplicate click broadcasts once, refreshes page and persists receipt', async () => {
    const dialog = await open(action);
    expect(dialog.textContent).toContain('a / a-1'); expect(dialog.textContent).toContain(sender); expect(dialog.textContent).toContain('130 agxn'); expect(dialog.textContent).toContain('130000');
    if (action === 'vote') { expect(dialog.textContent).toContain('yes'); expect(dialog.textContent).not.toContain('전송 원본:'); }
    else expect(dialog.textContent).toContain('1234567 agxn');
    if (action === 'proposal') for (const text of [authority, 'Title', 'Summary', 'Details']) expect(dialog.textContent).toContain(text);
    else expect(dialog.textContent).toContain(originalId);
    expect(boundary.wallet).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole('button', { name: '확인하고 지갑 서명' }); fireEvent.click(confirm); fireEvent.click(confirm);
    await screen.findByText('체인 포함 성공 · code 0');
    await waitFor(() => expect(loadReceipts()[0].actualFee).toEqual(actualFee));
    expect(boundary.broadcast).toHaveBeenCalledOnce();
    const [who, messages] = boundary.sign.mock.calls[0]; expect(who).toBe(sender); expect(messages[0].typeUrl).toBe(governanceMessages[action].typeUrl);
    expect(loadReceipts()[0].governance).toEqual({ action, proposalId: action === 'proposal' ? newId : originalId });
    const urls = http.mock.calls.map(([u]) => String(u)); expect(urls.some(u => u.includes(`/txs/${hash}`))).toBe(true);
    expect(urls.some(u => u.includes(`/balances/${sender}`))).toBe(true);
    if (action === 'proposal') {
      const link = await screen.findByRole('link', { name: `이벤트로 확인한 새 제안 #${newId}` }); expect(link.getAttribute('href')).toBe(`/governance/${newId}?chain=a`);
      await waitFor(() => expect(http.mock.calls.some(([u]) => String(u).includes(`/proposals/${newId}`))).toBe(true));
    } else {
      await screen.findByText('Updated proposal');
      if (action === 'vote') { await screen.findByText('내 투표: yes'); expect(screen.getByText(/실시간 집계:.*Yes: 900/)).toBeTruthy(); expect(await screen.findByText('VOTE_OPTION_YES')).toBeTruthy(); }
      else { fireEvent.click(await screen.findByRole('tab', { name: '예치 내역' })); await screen.findByText(sender); }
    }
  });
  it.each(['button', 'escape'] as const)('cancel by %s restores focus and broadcasts zero times', async method => {
    const dialog = await open(action); if (method === 'button') fireEvent.click(within(dialog).getByRole('button', { name: '취소' })); else await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement?.textContent).toContain(action === 'vote' ? 'Yes' : action === 'deposit' ? '예치 전송' : '제안 전송');
    expect(boundary.wallet).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('wallet rejection is cancellation with zero broadcasts', async () => {
    boundary.wallet.mockRejectedValue(new Error('User rejected')); await open(action); await approve();
    await screen.findByText('지갑 서명이 취소되었습니다. 전송하지 않았습니다.'); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('nonzero chain code never shows success', async () => {
    txStatus = 12; boundary.broadcast.mockResolvedValue({ code: 12, transactionHash: hash, rawLog: 'chain failure' });
    await open(action); await approve(); await screen.findByText('chain failure · code 12'); expect(screen.queryByText(/체인 포함 성공/)).toBeNull();
  });
  it('timeout is persisted and queried after remount without retransmission', async () => {
    boundary.broadcast.mockRejectedValue(new Error('Timeout')); await open(action); await approve();
    await screen.findByText(/확인 중 · Timeout/); expect(loadReceipts()[0].status).toBe('pending');
    cleanup(); included = true; render(<SavedTransactions chainKey="a" />); fireEvent.click(await screen.findByRole('button', { name: new RegExp(hash) }));
    fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' })); await screen.findByText(/체인 포함 성공/);
    expect(boundary.broadcast).toHaveBeenCalledOnce();
  });
  it('rechecks params and spendable funds immediately before the wallet signer', async () => {
    const tx = await prepareGovernanceTx(input(action)); window.keplr!.enable = vi.fn(async () => { paramsVersion = '0.2'; });
    await expect(tx.execute(() => {})).rejects.toThrow('params'); expect(boundary.wallet).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('blocks fee shortage and rechecks it before signing', async () => {
    const params = input(action); balances = [{ denom: 'agxn', amount: action === 'vote' ? '129' : '1234696' }];
    await expect(prepareGovernanceTx(params)).rejects.toThrow('잔액');
    balances = [{ denom: 'agxn', amount: '999999999' }]; const tx = await prepareGovernanceTx(params);
    window.keplr!.enable = vi.fn(async () => { balances = []; }); await expect(tx.execute(() => {})).rejects.toThrow('잔액'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('account A-B-A during wallet prompt invalidates signed bytes', async () => {
    const pending = deferred<Awaited<ReturnType<OfflineDirectSigner['signDirect']>>>(); boundary.wallet.mockReturnValue(pending.promise);
    const tx = await prepareGovernanceTx(input(action)); const sending = tx.execute(() => {}); const rejected = expect(sending).rejects.toThrow('변경');
    await waitFor(() => expect(boundary.wallet).toHaveBeenCalledOnce()); store.getState().disconnect(); connect();
    pending.resolve({ signed: SignDoc.fromPartial({ chainId: 'a-1' }), signature: { signature: '', pub_key: { type: '', value: '' } } });
    await rejected; expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('separates inclusion success from partial refresh failure and recovers on retry', async () => {
    const tx = await prepareGovernanceTx(input(action)); const receipt = await tx.execute(() => {});
    queryFailure = action === 'vote' ? '/tally' : action === 'deposit' ? '/deposits' : '/proposals';
    render(<TransactionResult receipt={receipt} />); await screen.findByText(/거래 성공 후 화면 갱신 실패/); expect(screen.getByText(/체인 포함 성공/)).toBeTruthy();
    queryFailure = ''; fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' })); await waitFor(() => expect(screen.queryByText(/거래 성공 후 화면 갱신 실패/)).toBeNull()); expect(boundary.broadcast).toHaveBeenCalledOnce();
  });
});

describe('W07 capability/registry/amount/period validation', () => {
  it.each(actions)('%s is encoded and decoded by the installed default registry, while Amino fails', async action => {
    const tx = await prepareGovernanceTx(input(action)); await tx.execute(() => {}); const message = boundary.sign.mock.calls[0][1][0];
    const registry = new Registry(defaultRegistryTypes); const bytes = registry.encode(message); expect(bytes.length).toBeGreaterThan(0);
    const decoded = registry.decode({ typeUrl: message.typeUrl, value: bytes }); expect(decoded).toMatchObject(message.value);
    expect(() => new AminoTypes(createDefaultAminoConverters()).toAmino(message)).toThrow();
    if (action === 'proposal') {
      const proposal = MsgSubmitProposal.decode(bytes); expect(proposal.proposer).toBe(sender);
      expect(proposal.messages[0].typeUrl).toBe('/cosmos.gov.v1.MsgExecLegacyContent');
      const exec = MsgExecLegacyContent.decode(proposal.messages[0].value); expect(exec.authority).toBe(authority); expect(exec.content?.typeUrl).toBe('/cosmos.gov.v1beta1.TextProposal');
      expect(TextProposal.decode(exec.content!.value)).toEqual({ title: 'Title', description: 'Details' });
    } else if (action === 'vote') expect(MsgVote.decode(bytes)).toMatchObject({ proposalId: BigInt(originalId), voter: sender, option: 1 });
    else expect(MsgDeposit.decode(bytes)).toMatchObject({ proposalId: BigInt(originalId), depositor: sender, amount: [{ denom: 'agxn', amount: '1234567' }] });
  });
  it.each(actions)('%s requires explicit capability and cannot inherit send fee policy', async action => {
    configure({ governanceCapabilities: undefined }); await expect(prepareGovernanceTx(input(action))).rejects.toThrow('메시지·수수료'); expect(boundary.simulate).not.toHaveBeenCalled();
  });
  it.each(actions)('%s blocks actual Keplr Amino before signer invocation', async action => {
    configure({ signing: [...signing, { wallet: 'keplr', method: 'amino', evidence: 'synthetic' }] });
    const tx = await prepareGovernanceTx(input(action));
    window.getOfflineSigner = vi.fn(() => ({ getAccounts: async () => [{ address: sender, pubkey, algo: 'secp256k1' }], signAmino: boundary.wallet }));
    await expect(tx.execute(() => {})).rejects.toThrow('서명 방식'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it.each(['0', '01', '-1', '1.1', '1e6', '18446744073709551616'])('rejects noncanonical/overflow proposal ID %s', async proposalId => {
    await expect(prepareGovernanceTx({ ...input('vote'), action: 'vote', proposalId, option: 'yes' })).rejects.toThrow('ID');
  });
  it('rejects invalid vote option through direct service calls', async () => {
    await expect(prepareGovernanceTx({ ...input('vote'), action: 'vote', proposalId: originalId, option: 'invalid' as 'yes' })).rejects.toThrow('선택지');
  });
  it.each(['vote', 'deposit'] as const)('%s blocks elapsed period, wrong status, and sign-time period changes', async action => {
    const params = input(action); deadline = new Date(Date.now()).toISOString(); await expect(prepareGovernanceTx(params)).rejects.toThrow('기간');
    deadline = '2099-01-01T00:00:00Z'; const tx = await prepareGovernanceTx(params);
    window.keplr!.enable = vi.fn(async () => { status = 'PROPOSAL_STATUS_PASSED'; }); await expect(tx.execute(() => {})).rejects.toThrow('상태'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('rejects future or unparseable voting start', async () => {
    for (const invalid of ['invalid', '2099-01-01T00:00:00Z']) { start = invalid; await expect(prepareGovernanceTx(input('vote'))).rejects.toThrow('기간'); }
  });
  it.each(['deposit', 'proposal'] as const)('%s handles 6/18 decimals, smallest units and large integer strings', async action => {
    for (const decimals of [6, 18]) {
      configure({ decimals });
      for (const display of ['9007199254740993.123456', decimals === 6 ? '0.000001' : '0.000000000000000001']) {
        const amount = displayToBase(display, decimals); const params = { ...input(action), action, amount, denom: 'agxn', displayAmount: display } as GovernanceTxInput;
        const tx = await prepareGovernanceTx(params); expect(tx.snapshot.amount).toBe(amount); await tx.execute(() => {});
        const msg = boundary.sign.mock.calls.at(-1)![1][0]; expect((msg.value.amount ?? msg.value.initialDeposit)[0]).toEqual({ amount, denom: 'agxn' });
      }
    }
  });
  it('blocks min-deposit policy, wrong denom and unknown legacy authority', async () => {
    minimum = '2000000'; await expect(prepareGovernanceTx(input('deposit'))).rejects.toThrow('최소 예치'); minimum = '1';
    await expect(prepareGovernanceTx({ ...input('deposit'), action: 'deposit', proposalId: originalId, amount: '1000000', denom: 'other' })).rejects.toThrow('denom');
    moduleAddress = sender; await expect(prepareGovernanceTx(input('proposal'))).rejects.toThrow('authority'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it.each(['vote', 'deposit'] as const)('%s blocks period expiration during the last spendable query', async action => {
    const tx = await prepareGovernanceTx(input(action)); const now = Date.now(); let late = false;
    vi.spyOn(Date, 'now').mockImplementation(() => late ? Date.parse('2100-01-01') : now);
    window.keplr!.enable = vi.fn(async () => { http.mockImplementation(async u => { const result = response(String(u)); if (String(u).includes('/spendable_balances/')) late = true; return result; }); });
    await expect(tx.execute(() => {})).rejects.toThrow(); expect(boundary.wallet).not.toHaveBeenCalled(); vi.restoreAllMocks();
  });
});

describe('W07 events, refresh boundaries and concurrency', () => {
  it.each([
    [], [{ type: 'other', attributes: [{ key: 'proposal_id', value: newId }] }],
    [{ type: 'submit_proposal', attributes: [{ key: 'proposal_id', value: '01' }] }],
    [{ type: 'submit_proposal', attributes: [{ key: 'proposal_id', value: newId }, { key: 'proposal_id', value: '12' }] }],
    [{ type: 'submit_proposal', attributes: [{ key: 'proposal_id', value: '18446744073709551616' }] }],
    [{ type: 'submit_proposal', attributes: [{ key: 'proposal_id', value: newId }, { key: 'proposal_id', value: '' }] }],
  ])('never guesses new ID for absent/malformed/ambiguous events (%j)', async (...eventList) => {
    events = eventList;
    const tx = await prepareGovernanceTx(input('proposal')); const receipt = await tx.execute(() => {}); const queried = await queryReceipt(receipt);
    expect(queried.status).toBe('success'); expect(queried.governance?.proposalId).toBeUndefined(); expect(queried.proposalIdWarning).toContain('미확인');
    await refreshTransactionReads(queried);
    expect(http.mock.calls.some(([u]) => String(u).includes(`/proposals/${newId}`))).toBe(false);
  });
  it('accepts matching event ID only for one own MsgSubmitProposal and retains uint64 exactly', () => {
    expect(proposalIdFromTx(rawTx(), sender)).toBe(newId);
    expect(proposalIdFromTx(rawTx(), authority)).toBeNull();
    const raw = rawTx(); raw.tx.body.messages.push(raw.tx.body.messages[0]); expect(proposalIdFromTx(raw, sender)).toBeNull();
    events = [{ type: 'submit_proposal', attributes: [{ key: 'proposal_id', value: '18446744073709551615' }] }];
    expect(proposalIdFromTx(rawTx(), sender)).toBe('18446744073709551615');
  });
  it('missing event ID has a success warning and a retry can recover the detail link', async () => {
    events = []; const tx = await prepareGovernanceTx(input('proposal')); render(<TransactionResult receipt={await tx.execute(() => {})} />);
    await screen.findByText(/submit_proposal 이벤트가 없거나 불명확/); expect(screen.getByText(/체인 포함 성공/)).toBeTruthy(); expect(screen.queryByRole('link', { name: /새 제안/ })).toBeNull();
    events = [{ type: 'submit_proposal', attributes: [{ key: 'proposal_id', value: newId }] }];
    fireEvent.click(screen.getByRole('button', { name: '거래 상태·관련 조회 다시 읽기' })); await screen.findByRole('link', { name: `이벤트로 확인한 새 제안 #${newId}` }); expect(boundary.broadcast).toHaveBeenCalledOnce();
  });
  it('new detail link pins chain and cannot sign against a different active chain', async () => {
    boundary.id = newId; boundary.chain = 'a'; setActiveChainKeyCookie('b'); render(<GovernanceProposalPage />);
    await screen.findByText(`제안 #${newId}`); expect(screen.getByText(/제안 링크 체인: a/)).toBeTruthy(); expect((screen.getByRole('button', { name: 'Yes' }) as HTMLButtonElement).disabled).toBe(true);
    const urls = http.mock.calls.map(([u]) => String(u)); expect(urls.some(u => u.startsWith('https://a.test') && u.endsWith(`/proposals/${newId}`))).toBe(true); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it('proposal list refresh updates the mounted list after inclusion', async () => {
    render(<GovernancePage />); await screen.findByRole('link', { name: /Current proposal/ });
    const tx = await prepareGovernanceTx(input('proposal')); const receipt = await queryReceipt(await tx.execute(() => {}));
    await act(async () => { await refreshTransactionReads(receipt); });
    expect((await screen.findAllByRole('link', { name: /Updated proposal/ })).some(l => l.getAttribute('href') === `/governance/${newId}?chain=a`)).toBe(true);
  });
  it('deposit advancing proposal status preserves inclusion result after refresh', async () => {
    await open('deposit'); boundary.broadcast.mockImplementation(async () => { included = true; status = 'PROPOSAL_STATUS_VOTING_PERIOD'; return { code: 0, transactionHash: hash }; }); await approve();
    await screen.findByText('Updated proposal'); await waitFor(() => expect(screen.queryByRole('button', { name: '예치 전송' })).toBeNull());
    expect(screen.getByText('체인 포함 성공 · code 0')).toBeTruthy();
  });
  it.each(actions)('%s blocks chain A-B-A even when final chain key matches', async action => {
    const tx = await prepareGovernanceTx(input(action)); setActiveChainKeyCookie('b'); setActiveChainKeyCookie('a');
    await expect(tx.execute(() => {})).rejects.toThrow('변경'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('late preparation cannot reopen confirmation after input A-B-A', async () => {
    const pending = deferred<number>(); boundary.simulate.mockReturnValue(pending.promise);
    render(<GovernanceNewProposalForm defaultDenom="agxn" />);
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: 'Title' } }); fireEvent.change(screen.getByLabelText(/요약/), { target: { value: 'Summary' } });
    fireEvent.change(screen.getByLabelText('초기 예치 (표시 단위)'), { target: { value: '1' } }); await screen.findByText('표시 수량 1 GXN → 전송 원본 1000000 agxn'); fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '제안 전송' })); await waitFor(() => expect(boundary.simulate).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: 'Changed' } }); fireEvent.change(screen.getByLabelText(/제목/), { target: { value: 'Title' } });
    await act(async () => { pending.resolve(100000); }); expect(screen.queryByRole('dialog')).toBeNull(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it.each(['proposal target', 'input amount', 'choice', 'disconnect'] as const)('invalidates existing confirmation on %s', async change => {
    const dialog = await open(change === 'input amount' ? 'proposal' : 'vote'); expect(dialog).toBeTruthy();
    if (change === 'input amount') fireEvent.change(screen.getByLabelText('초기 예치 (표시 단위)'), { target: { value: '2' } });
    else if (change === 'proposal target') { boundary.id = '12'; mounted.rerender(<GovernanceProposalPage />); }
    else if (change === 'choice') { fireEvent.click(within(dialog).getByRole('button', { name: '취소' })); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); fireEvent.click(screen.getByRole('button', { name: /^No$/ })); const next = await screen.findByRole('dialog'); expect(next.textContent).toContain('투표 선택: no'); }
    else act(() => store.getState().disconnect());
    if (change !== 'choice') await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it.each(['send', 'staking'] as const)('shares one account lock with %s', async otherAction => {
    const tx = await prepareGovernanceTx(input('vote'));
    const base = { walletType: 'keplr' as const, sessionTopic: null, bech32Address: sender, amount: '1000000', denom: 'agxn' };
    const other = otherAction === 'send' ? await prepareSendTx({ ...base, toAddress: authority }) : await prepareStakingTx({ ...base, action: 'delegate', validatorAddress: validator });
    const pending = deferred<Awaited<ReturnType<OfflineDirectSigner['signDirect']>>>(); boundary.wallet.mockReturnValue(pending.promise);
    const executing = tx.execute(() => {}); await waitFor(() => expect(boundary.wallet).toHaveBeenCalledOnce());
    await expect(other.execute(() => {})).rejects.toThrow('처리 중');
    pending.resolve({ signed: SignDoc.fromPartial({ chainId: 'a-1' }), signature: { signature: '', pub_key: { type: '', value: '' } } }); await executing; expect(boundary.broadcast).toHaveBeenCalledOnce();
  });
  it.each(actions)('%s distinguishes CheckTx rejection from an uncertain timeout', async action => {
    boundary.broadcast.mockRejectedValue(new BroadcastTxError(13, 'sdk', 'CheckTx rejected'));
    const tx = await prepareGovernanceTx(input(action)); const receipt = await tx.execute(() => {});
    expect(receipt).toMatchObject({ status: 'failed', code: 13, hash, message: 'CheckTx rejected' });
  });
  it.each([{ code: undefined, transactionHash: hash }, { code: 0, transactionHash: 'WRONG' }])('ambiguous node response remains pending', async result => {
    boundary.broadcast.mockResolvedValue(result); const tx = await prepareGovernanceTx(input('vote')); const receipt = await tx.execute(() => {}); expect(receipt.status).toBe('pending'); expect(receipt.hash).toBe(hash);
  });
  it('fee changes are shown and LCD failure cannot retract a terminal receipt', async () => {
    const tx = await prepareGovernanceTx(input('vote')); const receipt = await tx.execute(() => {}); actualFee = [{ denom: 'agxn', amount: '999' }];
    const queried = await queryReceipt(receipt); expect(queried.feeWarning).toContain('다릅니다'); expect(queried.actualFee).toEqual(actualFee);
    saveReceipt(queried); queryFailure = `/txs/${hash}`; const failedRead = await queryReceipt(queried); expect(failedRead.status).toBe('success'); expect(failedRead.actualFee).toEqual(actualFee); expect(failedRead.queryError).toContain('실패');
  });
  it('late proposal response from chain A cannot overwrite selected B', async () => {
    const pending = deferred<Response>(); http.mockImplementation(async u => String(u).startsWith('https://a.test') && String(u).endsWith(`/proposals/${originalId}`) ? pending.promise : response(String(u)));
    render(<GovernanceProposalPage />); await waitFor(() => expect(http.mock.calls.some(([u]) => String(u).includes(`/proposals/${originalId}`))).toBe(true));
    act(() => setActiveChainKeyCookie('b')); await screen.findByText('Current proposal');
    await act(async () => { pending.resolve(Response.json({ proposal: { ...rawProposal(), title: 'Late A' } })); }); expect(screen.queryByText('Late A')).toBeNull();
  });
});

describe('W07 unsupported combinations fail closed', () => {
  it.each(actions)('%s blocks WalletConnect Amino even if configuration claims support', async action => {
    const wc = { wallet: 'walletconnect' as const, method: 'amino' as const, evidence: 'synthetic unsupported claim' };
    configure({ signing: [wc], governanceCapabilities: {
      ...a.governanceCapabilities, [action]: { ...a.governanceCapabilities![action], signing: [wc] },
    } });
    store.getState().connect('walletconnect', sender, null, { chainKey: 'a', chainId: 'a-1', pubkey, sessionTopic: 'synthetic', methods: ['cosmos_signAmino'] });
    await expect(prepareGovernanceTx({ ...input(action), walletType: 'walletconnect', sessionTopic: 'synthetic' })).rejects.toThrow('Amino'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('blocks mismatched message, module, and fee denom', async () => {
    configure({ features: { governance: false } }); await expect(prepareGovernanceTx(input('vote'))).rejects.toThrow('모듈');
    configure({ governanceCapabilities: { vote: { ...a.governanceCapabilities!.vote!, typeUrl: '/unsupported.MsgVote' } } }); await expect(prepareGovernanceTx(input('vote'))).rejects.toThrow('메시지');
    configure({ governanceCapabilities: { vote: { ...a.governanceCapabilities!.vote!, fee: { ...fee, gasPrice: '0.001other' } } } }); await expect(prepareGovernanceTx(input('vote'))).rejects.toThrow('수수료 가격');
  });
  it('simulation errors never become a zero fee or a hidden gas fallback', async () => {
    boundary.simulate.mockRejectedValue(new Error('RPC simulation unavailable')); await expect(prepareGovernanceTx(input('proposal'))).rejects.toThrow('수수료 추정 실패'); expect(boundary.wallet).not.toHaveBeenCalled();
  });
  it('v1 read errors cannot silently fall back to legacy write compatibility', async () => {
    http.mockImplementation(async u => String(u).includes('/gov/v1/') ? new Response('', { status: 404 }) : response(String(u)));
    await expect(prepareGovernanceTx(input('vote'))).rejects.toThrow(); expect(boundary.wallet).not.toHaveBeenCalled(); expect(http.mock.calls.some(([u]) => String(u).includes('/gov/v1beta1'))).toBe(false);
  });
  it('reads modern full params in preparation and the rendered form', async () => {
    const params = { min_deposit: [{ denom: 'agxn', amount: '1' }], max_deposit_period: '100s', voting_period: '100s', quorum: '0.3', threshold: '0.5', veto_threshold: '0.3', min_initial_deposit_ratio: '0.1' };
    http.mockImplementation(async u => String(u).includes('/gov/v1/params/') ? Response.json({ params }) : response(String(u)));
    const tx = await prepareGovernanceTx(input('deposit')); expect(tx.snapshot.denom).toBe('agxn');
    render(<GovernanceProposalPage />); await screen.findByText('예치하기 (agxn)');
  });
  it('rejects multiple deposit denoms instead of choosing the first silently', async () => {
    http.mockImplementation(async u => String(u).endsWith('/params/deposit') ? Response.json({ deposit_params: { min_deposit: [{ denom: 'agxn', amount: '1' }, { denom: 'other', amount: '1' }] } }) : response(String(u)));
    await expect(prepareGovernanceTx(input('proposal'))).rejects.toThrow('다중 denom');
  });
  it('separately funds deposit asset and fee asset', async () => {
    configure({ feeDenom: 'uother', governanceCapabilities: { deposit: { ...a.governanceCapabilities!.deposit!, fee: { ...fee, gasPrice: '0.001uother' } } } });
    balances = [{ denom: 'agxn', amount: '1234567' }]; await expect(prepareGovernanceTx(input('deposit'))).rejects.toThrow('uother');
    balances.push({ denom: 'uother', amount: '130' }); const tx = await prepareGovernanceTx(input('deposit')); expect(tx.snapshot.fee.amount).toEqual([{ denom: 'uother', amount: '130' }]);
  });
  it('transaction cannot broadcast when the period expires during the wallet prompt', async () => {
    const now = Date.now(); deadline = new Date(now + 1000).toISOString(); const tx = await prepareGovernanceTx(input('vote'));
    boundary.wallet.mockImplementation(async (_sender, doc) => { vi.spyOn(Date, 'now').mockReturnValue(now + 1001); return { signed: doc, signature: { signature: '', pub_key: { type: '', value: '' } } }; });
    await expect(tx.execute(() => {})).rejects.toThrow('기간'); expect(boundary.broadcast).not.toHaveBeenCalled(); vi.restoreAllMocks();
  });
});
it('missing legacy handler evidence blocks proposal writes while chain reads remain configured', async () => {
  configure({ governanceCapabilities: { ...a.governanceCapabilities, proposal: { ...a.governanceCapabilities!.proposal!, legacyContent: undefined } } });
  expect(getActiveChainConfig().key).toBe('a');
  await expect(prepareGovernanceTx(input('proposal'))).rejects.toThrow('legacy TextProposal'); expect(boundary.wallet).not.toHaveBeenCalled();
});
it('deposit validates its own deadline when voting timestamps are not assigned yet', async () => {
  const params = input('deposit');
  http.mockImplementation(async u => String(u).endsWith(`/proposals/${originalId}`) ? Response.json({ proposal: { ...rawProposal(), voting_start_time: null, voting_end_time: null } }) : response(String(u)));
  expect((await prepareGovernanceTx(params)).snapshot.recipient).toBe(originalId);
  deadline = ''; await expect(prepareGovernanceTx(params)).rejects.toThrow('기간'); expect(boundary.wallet).not.toHaveBeenCalled();
});
