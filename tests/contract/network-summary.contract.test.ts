import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getNetworkSummaryPayload } from '@/server/handlers/network-summary.handler';
import { getAccountsTotal, getApplicationVersions, getNetworkSummary } from '@/services/guru/network-summary.service';
import { readQuery } from '@/lib/query-result';
import { mockNetworkSummaryHttp, restoreHttpBoundary } from '../helpers/network-summary';
let http: ReturnType<typeof mockNetworkSummaryHttp>;
beforeEach(() => { http = mockNetworkSummaryHttp(); });
afterEach(restoreHttpBoundary);
const context = { chain: 'fixture', target: 'network-summary' };
describe('network summary HTTP boundary', () => {
  it('transforms chain, intervals, amounts and inflation', async () => {
    expect(await getNetworkSummaryPayload()).toEqual({
      status: 200, body: {
        chainId: 'fixture-chain-1', blockHeight: 3, averageBlockTimeSec: 1,
        supply: '123456789.0123 gxn', bonded: '4.5 gxn', inflation: '4.20%',
      }
    });
    expect(http).toHaveBeenCalledTimes(7);
  });
  it('preserves successful zero', async () => {
    const respond = http.getMockImplementation()!;
    http.mockImplementation((input, init) => String(input).includes('/supply/') ? Promise.resolve(Response.json({ amount: { amount: '0', denom: 'agxn' } })) : respond(input, init));
    expect(await readQuery(context, () => getNetworkSummary())).toMatchObject({ status: 'success', data: { supply: '0 gxn' }, blockHeight: '3', error: null });
  });
  it('keeps successful metrics and failed inflation without inventing zero', async () => {
    const respond = http.getMockImplementation()!;
    http.mockImplementation((input, init) => String(input).endsWith('/inflation') ? Promise.resolve(new Response('', { status: 503 })) : respond(input, init));
    expect(await readQuery(context, () => getNetworkSummary())).toMatchObject({ status: 'partial', data: { supply: '123456789.0123 gxn', inflation: '-' }, error: { kind: 'http', status: 503 } });
  });
  it.each(['http', 'parse', 'timeout', 'network', 'schema'])('preserves %s failure instead of zero', async kind => {
    if (kind === 'http') http.mockResolvedValue(new Response('', { status: 500 }));
    if (kind === 'parse') http.mockResolvedValue(new Response('bad-json'));
    if (kind === 'timeout') http.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    if (kind === 'network') http.mockRejectedValue(new TypeError('offline'));
    if (kind === 'schema') http.mockResolvedValue(Response.json({}));
    expect(await readQuery(context, () => getNetworkSummary())).toMatchObject({ status: 'error', data: null, error: { kind } });
  });
  it('preserves total as a string', async () => { expect(await getAccountsTotal()).toBe('9007199254740993'); });
  it.each(['0', ' 42 '])('accepts total %s', async raw => { http.mockResolvedValue(Response.json({ pagination: { total: raw } })); expect(await getAccountsTotal()).toBe(raw.trim()); });
  it.each(['bad', '', undefined])('rejects invalid total %s', async raw => { http.mockResolvedValue(Response.json({ pagination: { total: raw } })); await expect(getAccountsTotal()).rejects.toMatchObject({ info: { kind: 'schema' } }); });
  it('keeps account lookup errors', async () => { http.mockRejectedValue(new TypeError('offline')); await expect(getAccountsTotal()).rejects.toMatchObject({ info: { kind: 'network' } }); });
  it('maps observed node versions', async () => { expect(await getApplicationVersions()).toContainEqual({ name: 'network', version: 'guru_631-1' }); });
  it('keeps version HTTP failure', async () => { http.mockResolvedValue(new Response('', { status: 503 })); await expect(getApplicationVersions()).rejects.toMatchObject({ info: { status: 503 } }); });
});
