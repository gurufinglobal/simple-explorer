// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { bech32 } from 'bech32';
import { GovernanceNewProposalForm } from '@/components/governance/governance-new-proposal-form';
import { DashboardView } from '@/components/network/dashboard-view';
import { useWalletSessionStore as store } from '@/stores/wallet-session.store';
import { connectExtension } from '@/services/wallet/wallet-lifecycle';
import { displayToBase } from '@/lib/cosmos-amount';
import { prepareSendTx, submitSendTx as executeSend, type SendTxInput } from '@/services/guru/bank-tx.client';
import { stakingMessages, prepareStakingTx } from "@/services/guru/staking-tx.client";
import { prepareGovernanceTx, governanceMessages } from '@/services/guru/governance-tx.client';
const submitSendTx = async (input: SendTxInput) => executeSend(await prepareSendTx(input));
const boundary = vi.hoisted(() => ({ connect: vi.fn(), sign: vi.fn(), broadcast: vi.fn() }));
vi.mock('@cosmjs/stargate', async original => ({ ...await original<typeof import('@cosmjs/stargate')>(), SigningStargateClient: { connectWithSigner: boundary.connect } }));
const address = bech32.encode('guru', bech32.toWords(new Uint8Array(20).fill(1)));
const validatorAddress = bech32.encode('guruvaloper', bech32.toWords(new Uint8Array(20).fill(1)));
const pubkey = new Uint8Array(33).fill(3);
const base = { walletType: 'keplr' as const, sessionTopic: null, bech32Address: address };
function configure(decimals = 6) {
  vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ key: 'a', name: 'A', chainId: 'a-1', lcdUrl: 'https://a.test:1317', rpcUrl: 'https://a.test:26657', bech32Prefix: 'guru', nativeDenom: 'agxn', bondDenom: 'agxn', feeDenom: 'agxn', decimals,
    features: { staking: true, distribution: true, governance: true },
    governanceCapabilities: Object.fromEntries(Object.entries(governanceMessages).map(([action, definition]) => [action, { typeUrl: definition.typeUrl, evidence: 'synthetic only', legacyContent: { authority: address, evidence: 'synthetic only' }, signing: [{ wallet: 'keplr', method: 'direct', evidence: 'synthetic' }], fee: { mode: 'fixed', gasPrice: '0.001agxn', gas: 220000, evidence: 'synthetic', limitation: 'synthetic only' } }])) ,
    stakingCapabilities: Object.fromEntries(Object.entries(stakingMessages).map(([action, definition]) => [action, { typeUrl: definition.typeUrl, evidence: 'synthetic only', signing: [{ wallet: 'keplr', method: 'direct', evidence: 'synthetic' }], fee: { mode: 'fixed', gasPrice: '0.001agxn', gas: 220000, evidence: 'synthetic', limitation: 'synthetic only' } }])),
    sendFeePolicy: { mode: 'fixed', gasPrice: '0.001agxn', gas: 220000, evidence: 'synthetic fee policy', limitation: 'synthetic only' },
    signing: [{ wallet: 'keplr', method: 'direct', evidence: 'synthetic boundary' }], rpcAccess: { origin: 'http://localhost:3000', get: true, post: true, options: true, observedAt: '2026-10-20', evidence: 'synthetic boundary' } }]));
  vi.stubEnv('NEXT_PUBLIC_DEFAULT_CHAIN_KEY', 'a');
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    if (url.port === '26657') return Response.json({ result: { node_info: { network: 'a-1' } } });
    if (url.pathname.endsWith('/node_info')) return Response.json({ default_node_info: { network: 'a-1' }, application_version: {} });
    if (url.pathname.endsWith('/denoms_metadata')) return Response.json({ metadatas: [{ base: 'agxn', display: 'gxn', symbol: 'GXN', denom_units: [{ denom: 'agxn', exponent: 0 }, { denom: 'gxn', exponent: decimals }] }] });
    if ((url.pathname.includes('/balances/') || url.pathname.includes('/spendable_balances/'))) return Response.json({ balances: [{ denom: 'agxn', amount: '999999999999999999999999999999999999999999999999' }] });
    if (url.pathname.endsWith('/params/deposit')) return Response.json({ deposit_params: { min_deposit: [{ denom: 'agxn', amount: '1' }] } });
    if (url.pathname.endsWith('/params/voting')) return Response.json({ voting_params: { voting_period: '100s' } });
    if (url.pathname.endsWith('/params/tallying')) return Response.json({ tally_params: { quorum: '0.3', threshold: '0.5', veto_threshold: '0.3' } });
    if (url.pathname.endsWith('/proposals/1')) return Response.json({ proposal: { id: '1', status: 'PROPOSAL_STATUS_DEPOSIT_PERIOD', deposit_end_time: '2099-01-01T00:00:00Z', voting_start_time: '', voting_end_time: '' } });
    if (url.pathname.endsWith('/module_accounts')) return Response.json({ accounts: [{ name: 'gov', base_account: { address } }] });
    if (url.pathname.includes('/auth/')) return Response.json({ account: { account_number: '1', sequence: '0', pub_key: { key: Buffer.from(pubkey).toString('base64') } }, pagination: { total: '1' } });
    if (url.pathname.endsWith('/staking/v1beta1/params')) return Response.json({ params: { bond_denom: 'agxn', unbonding_time: '86400s' } });
    if (url.pathname.endsWith(`/validators/${validatorAddress}`)) return Response.json({ validator: { operator_address: validatorAddress, jailed: false, status: 'BOND_STATUS_BONDED' } });
    if (url.pathname.includes(`/validators/${validatorAddress}/delegations/`)) return Response.json({ delegation_response: { delegation: { delegator_address: address, validator_address: validatorAddress }, balance: { amount: '999999999999999999999999999999999999999999999999', denom: 'agxn' } } });
    if (url.pathname.endsWith('/validators')) return Response.json({ validators: [] });
    if (url.pathname.endsWith('/blocks/latest')) return Response.json({ block: { header: { height: '1', time: '2026-01-01T00:00:00Z', chain_id: 'a-1' } } });
    if (url.pathname.endsWith('/supply/by_denom')) return Response.json({ amount: { amount: '1000000', denom: 'agxn' } });
    if (url.pathname.endsWith('/pool')) return Response.json({ pool: { bonded_tokens: '1' } });
    if (url.pathname.endsWith('/inflation')) return Response.json({ inflation: '0.01' });
    throw new Error(`Unexpected ${url.pathname}`);
  }));
}
beforeEach(() => {
  vi.clearAllMocks(); document.cookie = 'gf_chain=; max-age=0; path=/'; store.getState().disconnect(); configure();
  window.keplr = { enable: vi.fn().mockResolvedValue(undefined) };
  window.getOfflineSigner = vi.fn(() => ({ getAccounts: async () => [{ address, pubkey, algo: 'secp256k1' }], signDirect: vi.fn() }));
  boundary.sign.mockResolvedValue({ bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), signatures: [] });
  boundary.broadcast.mockResolvedValue({ code: 0, transactionHash: 'MOCK-TX' });
  boundary.connect.mockResolvedValue({ sign: boundary.sign, broadcastTx: boundary.broadcast, disconnect: vi.fn() });
});
afterEach(() => { cleanup(); store.getState().disconnect(); delete window.keplr; delete window.getOfflineSigner; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const actions = [
  ['send', (amount: string) => submitSendTx({ ...base, toAddress: address, denom: 'agxn', amount })],
  ['delegate', (amount: string) => prepareStakingTx({ action: "delegate", ...base, validatorAddress, denom: 'agxn', amount }).then(tx => tx.execute(() => {}))],
  ['undelegate', (amount: string) => prepareStakingTx({ action: "undelegate", ...base, validatorAddress, denom: 'agxn', amount }).then(tx => tx.execute(() => {}))],
  ['deposit', (amount: string) => prepareGovernanceTx({ action: "deposit", ...base, proposalId: '1', denom: 'agxn', amount }).then(tx => tx.execute(() => {}))],
  ['proposal', (amount: string) => prepareGovernanceTx({ action: 'proposal', ...base, title: 'Title', summary: 'Summary', description: 'Details', denom: 'agxn', amount }).then(tx => tx.execute(() => {}))],
] as const;
describe('AC02-4 real message generation with only SDK/network/wallet boundaries mocked', () => {
  it.each(actions)('%s rejects 0/00/negative/exponent/fraction before signer access', async (_name, send) => {
    await connectExtension('keplr'); vi.mocked(window.getOfflineSigner!).mockClear();
    for (const input of ['0', '00', '-1', '1e6', '1.1']) await expect(send(input)).rejects.toThrow();
    expect(window.getOfflineSigner).not.toHaveBeenCalled(); expect(boundary.connect).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it.each(actions)('%s message preserves converted 6/18-place quantities exactly', async (_name, send) => {
    for (const decimals of [6, 18]) {
      configure(decimals); await connectExtension('keplr');
      const amount = displayToBase('9007199254740993.123456', decimals);
      await send(amount);
      const message = boundary.sign.mock.calls.at(-1)![1][0];
      const coin = message.value.initialDeposit?.[0] ?? (Array.isArray(message.value.amount) ? message.value.amount[0] : message.value.amount);
      expect(coin).toEqual({ amount, denom: 'agxn' });
    }
  });
  it('proposal DOM confirmation equals the actual message; precision excess blocks and edits invalidate confirmation', async () => {
    render(<GovernanceNewProposalForm defaultDenom="agxn" />);
    await act(async () => { await connectExtension('keplr'); });
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText(/요약/), { target: { value: 'Summary' } });
    const input = screen.getByLabelText('초기 예치 (표시 단위)');
    fireEvent.change(input, { target: { value: '1.2345678' } });
    await screen.findByText('허용 소수 6자리를 초과했습니다.');
    expect((screen.getByRole('button', { name: '제안 전송' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: '1.234567' } });
    await screen.findByText('표시 수량 1.234567 GXN → 전송 원본 1234567 agxn');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(input, { target: { value: '2' } });
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    fireEvent.change(input, { target: { value: '1.234567' } });
    // Returning to an old input must also require a fresh confirmation.
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '제안 전송' }));
    expect(boundary.sign).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '확인하고 지갑 서명' }));
    await waitFor(() => expect(boundary.sign).toHaveBeenCalledOnce());
    expect(boundary.sign.mock.calls[0][1][0].value.initialDeposit).toEqual([{ amount: '1234567', denom: 'agxn' }]);
  });
  it('dashboard SEND confirms display/base and resets approval when the account generation changes', async () => {
    render(<DashboardView />);
    await act(async () => { await connectExtension('keplr'); });
    fireEvent.click(screen.getByRole('button', { name: 'SEND' }));
    fireEvent.change(screen.getByLabelText('수신 주소'), { target: { value: address } });
    fireEvent.change(screen.getByLabelText('수량 (표시 단위)'), { target: { value: '1.234567' } });
    await screen.findByText('표시 수량 1.234567 GXN → 전송 원본 1234567 agxn');
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => { await connectExtension('keplr'); });
    expect((screen.getByRole('button', { name: 'Send Tx' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Send Tx' }));
    fireEvent.click(await screen.findByRole('button', { name: '확인하고 지갑 서명' }));
    await waitFor(() => expect(boundary.sign).toHaveBeenCalled());
    expect(boundary.sign.mock.calls[0][1][0].value.amount).toEqual([{ amount: '1234567', denom: 'agxn' }]);
  });
});
