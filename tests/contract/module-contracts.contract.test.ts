import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/services/clients';
import { readQuery } from '@/lib/query-result';
import { getIbcChannels } from '@/services/guru/ibc-channels.service';
import { getBexExchangeById, getBexExchangeFees, listBexExchanges } from '@/services/guru/bex.service';
import { getOracleParams, getOracleResultAtNonceZero, listOracleRequests, listOracleReports } from '@/services/guru/oracle.service';
import { getFeePolicyDiscountByAddress, listFeePolicyDiscounts } from '@/services/guru/feepolicy.service';
import { getTokenMetadata } from '@/services/guru/token-metadata.service';
import type { ChainConfig } from '@/lib/env';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
import fee from '../fixtures/tgxn-2026-10-20/feepolicy.json';
const chain: ChainConfig = { key: 'fixture', name: 'Fixture', lcdUrl: 'https://lcd.example', features: { bex: true, oracle: true, feepolicy: true } };
const client = () => createQueryClient(chain);
const context = { chain: 'fixture', target: 'modules' };
const bexRow = { id: '9007199254740993', fee: '0.006000000000000000', limit: '999999999999999999999999.000000000000000001' };
const oracleRow = { id: '1', nonce: '9007199254740993' };
const feeRow = { address: '', modules: [{ module: 'bank', discounts: [{ discount_type: 'percentage', msg_type: '/cosmos.bank.v1beta1.MsgSend', amount: '0.000000000000000001' }] }] };
afterEach(() => { vi.useRealTimers(); restoreHttpBoundary(); });

describe('W12 IBC exact installed protobuf enum contract', () => {
  const states = ['UNINITIALIZED', 'INIT', 'TRYOPEN', 'OPEN', 'CLOSED'];
  it.each(states.flatMap((label, value) => [[value, label], [`STATE_${label}`, label], [label, label]]))('%s → %s', async (raw, expected) => {
    mockQueryHttp(() => ({ channels: [{ port_id: 'transfer', channel_id: 'channel-0', state: raw, ordering: 'ORDER_UNORDERED' }] }));
    expect((await getIbcChannels())[0]).toMatchObject({ state: expected, stateRaw: String(raw), ordering: 'UNORDERED' });
  });
  it.each(['STATE_UNINITIALIZED_UNSPECIFIED', 'PREOPEN', 'REINIT', 'TRY_OPEN', 'open', 'STATE_OPEN_EXTRA', 999])('does not infer unknown %s from substrings', async raw => {
    mockQueryHttp(() => ({ channels: [{ port_id: 'transfer', channel_id: 'channel-0', channel: { state: raw, ordering: 'NOT_ORDERED' } }] }));
    expect((await getIbcChannels())[0]).toMatchObject({ state: raw === 'STATE_UNINITIALIZED_UNSPECIFIED' ? 'UNINITIALIZED' : String(raw), ordering: 'NOT_ORDERED' });
  });
  it.each([[0, 'NONE_UNSPECIFIED'], [1, 'UNORDERED'], [2, 'ORDERED'], ['ORDER_NONE_UNSPECIFIED', 'NONE_UNSPECIFIED'], ['ORDER_ORDERED', 'ORDERED'], ['ORDER_UNORDERED', 'UNORDERED'], [99, '99']])('ordering %s → %s', async (raw, expected) => {
    mockQueryHttp(() => ({ channels: [{ port_id: 'transfer', channel_id: 'channel-0', state: 0, ordering: raw }] }));
    expect((await getIbcChannels())[0].ordering).toBe(expected);
  });
});

const modules = [
  { name: 'bex', field: 'exchanges', row: bexRow, load: () => listBexExchanges(client()) },
  { name: 'oracle', field: 'requests', row: oracleRow, load: () => listOracleRequests(undefined, client()) },
  { name: 'feepolicy', field: 'discounts', row: feeRow, load: () => listFeePolicyDiscounts(client()) },
];
describe.each(modules)('W12 $name actual HTTP transforms', ({ field, row, load }) => {
  it.each([false, undefined])('capability %s blocks before HTTP', async enabled => {
    const http = mockQueryHttp(() => ({}));
    const off = createQueryClient({ ...chain, features: { bex: enabled, oracle: enabled, feepolicy: enabled } });
    for (const path of ['/guru/bex/v1/exchanges', '/guru/oracle/v2/params', '/guru/feepolicy/v1/discounts/ALL', 'https://lcd.example/guru/bex/v1/exchanges']) {
      expect(await readQuery(context, () => off.lcdGet(path))).toMatchObject({ status: 'unsupported' });
    }
    expect(http).not.toHaveBeenCalled();
  });
  it.each([404, 500])('HTTP %s remains an error', async status => {
    mockQueryHttp(() => new Response('', { status }));
    expect(await readQuery<unknown[]>(context, load)).toMatchObject({ status: 'error', error: { kind: 'http', status } });
  });
  it('normal empty, malformed and partial are distinct; raw values survive', async () => {
    const http = mockQueryHttp(() => ({ [field]: [] }));
    expect(await readQuery<unknown[]>(context, load)).toMatchObject({ status: 'empty', data: [] });
    http.mockResolvedValueOnce(Response.json({ [field]: 'bad' }));
    expect(await readQuery<unknown[]>(context, load)).toMatchObject({ status: 'error', error: { kind: 'schema' } });
    http.mockResolvedValueOnce(Response.json({ [field]: [row, null, {}] }));
    const partial = await readQuery<unknown[]>(context, load);
    expect(partial.status).toBe('partial'); expect(partial.data).toHaveLength(1);
    http.mockResolvedValueOnce(Response.json({ [field]: [null] }));
    expect(await readQuery<unknown[]>(context, load)).toMatchObject({ status: 'error', error: { kind: 'schema' } });
  });
  it('runs actual 10s timeout, retry and stale preservation', async () => {
    vi.useFakeTimers();
    const http = mockQueryHttp(() => ({ [field]: [row] }));
    const prior = await readQuery<unknown[]>(context, load);
    http.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const pending = readQuery<unknown[]>(context, load, prior);
    await vi.advanceTimersByTimeAsync(10000);
    const stale = await pending;
    expect(stale).toMatchObject({ status: 'stale', error: { kind: 'timeout' }, data: prior.data, observedAt: prior.observedAt });
    expect(await readQuery<unknown[]>(context, load, stale)).toMatchObject({ status: 'success', error: null });
  });
});
it('partial list payloads become detail objects, never arrays or false not-found', async () => {
  mockQueryHttp(url => url.pathname.includes('/bex/') ? { exchanges: [bexRow, null] } : { discounts: [feeRow, null] });
  expect(await readQuery(context, () => getBexExchangeById(bexRow.id, client()))).toMatchObject({ status: 'partial', data: { id: bexRow.id, fee: bexRow.fee, limit: bexRow.limit } });
  expect(await readQuery(context, () => getBexExchangeById('2', client()))).toMatchObject({ status: 'error', data: null });
  expect(await readQuery(context, () => getFeePolicyDiscountByAddress('ALL', client()))).toMatchObject({ status: 'partial', data: { address: '' } });
});
it('BEX malformed fee section preserves successful siblings and unknown fields never become zero', async () => {
  mockQueryHttp(url => url.pathname.endsWith('/exchanges') ? { exchanges: [{ id: '1' }] } : { coins: url.pathname.includes('locked') ? 'bad' : [{ denom: 'agxn', amount: '9007199254740993' }] });
  expect((await listBexExchanges(client()))[0]).toMatchObject({ fee: '—', limit: '—', oracleRequestId: '—' });
  expect(await readQuery(context, () => getBexExchangeFees('1', client()))).toMatchObject({ status: 'partial', data: { hasLockedError: true, collected: [{ amount: '9007199254740993' }] } });
});
it('actual percent and synthetic percentage remain separate exact amounts', async () => {
  const http = mockQueryHttp(() => fee.response);
  const actual = await listFeePolicyDiscounts(client());
  expect(actual[0].modules[0].discounts[0]).toMatchObject({ discountType: 'percent', amount: '100.000000000000000000' });
  http.mockResolvedValueOnce(Response.json({ discounts: [feeRow] }));
  expect((await listFeePolicyDiscounts(client()))[0].modules[0].discounts[0]).toMatchObject({ discountType: 'percentage', amount: '0.000000000000000001' });
});
it('Oracle nonce/time/report are raw, malformed result fails and missing params are unknown', async () => {
  const http = mockQueryHttp(url => url.pathname.endsWith('/params') ? { params: {} } : url.pathname.endsWith('/reports') ? { reports: [{ request_id: '1', nonce: '0', signature: 'unverified' }] } : { result: { request_id: '1', aggregated_time: '999999999999999999999', nonce: '0' } });
  expect(await getOracleParams(client())).toMatchObject({ enable: null, quorumRatio: '—' });
  expect(await getOracleResultAtNonceZero('1', client())).toMatchObject({ nonce: '0', aggregatedTime: '999999999999999999999' });
  expect(http.mock.calls.some(([url]) => String(url).endsWith('/result?nonce=0'))).toBe(true);
  expect((await listOracleReports({ requestId: '1' }, client()))[0]).toMatchObject({ signature: 'unverified' });
  http.mockResolvedValueOnce(Response.json({ result: [] }));
  await expect(getOracleResultAtNonceZero('1', client())).rejects.toMatchObject({ info: { kind: 'schema' } });
});
it('records endpoint/time/header height without inventing an unavailable height', async () => {
  const http = mockQueryHttp(() => new Response(JSON.stringify({ exchanges: [] }), { headers: { 'x-cosmos-block-height': '123' } }));
  const query = client(); await listBexExchanges(query);
  expect(query.observations).toEqual([{ endpoint: chain.lcdUrl + '/guru/bex/v1/exchanges', observedAt: expect.any(String), blockHeight: '123' }]);
  http.mockResolvedValueOnce(Response.json({ exchanges: [] })); await listBexExchanges(query);
  expect(query.observations[1].blockHeight).toBeNull();
});
it('token lookup does not infer symbol/name/decimals from denom or IBC trace', async () => {
  mockQueryHttp(url => url.pathname.includes('denom_traces') ? { denom_trace: { base_denom: 'uatom', path: 'transfer/channel-1' } } : { metadata: { base: 'agxn' } });
  expect(await getTokenMetadata('agxn', client())).toMatchObject({ name: '미확인', symbol: '미확인', decimals: null });
  expect(await getTokenMetadata('ibc:ABC', client())).toMatchObject({ name: '미확인', symbol: '미확인', sourceChannel: 'channel-1' });
});

it('retains valid coins even when every BEX fee section has malformed siblings', async () => {
  mockQueryHttp(() => ({ coins: [{ denom: 'agxn', amount: '123' }, null] }));
  expect(await readQuery(context, () => getBexExchangeFees('1', client()))).toMatchObject({ status: 'partial', data: { collected: [{ amount: '123' }], locked: [{ amount: '123' }], available: [{ amount: '123' }], hasCollectedError: true } });
});
