import { afterEach, describe, expect, it } from 'vitest';
import { getTxDetail } from '@/services/guru/tx-details.service';
import { getTransactionsAtHeight } from '@/services/guru/transactions.service';
import { apiClients } from '@/services/clients';
import { readQuery } from '@/lib/query-result';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
import fixture from '../fixtures/tx-inspection.synthetic.json';
afterEach(restoreHttpBoundary);
const hash = 'A'.repeat(64);
describe('LCD detail preservation through HTTP boundary', () => {
  it('prefers top-level tx and retains all unknown fields, ordered/repeated attributes and large numbers in one request', async () => {
    const http = mockQueryHttp(() => fixture);
    const detail = await getTxDetail(hash);
    expect(detail.txSource).toBe('top');
    expect(detail.memo).toBe('Detailed fixture');
    expect(detail.raw).toEqual(fixture);
    expect(detail.messageBodies).toEqual(fixture.tx.body.messages);
    expect(detail.events).toEqual(fixture.tx_response.events);
    expect(detail.logs).toEqual(fixture.tx_response.logs);
    expect(detail.feeAmount[0].amount).toBe('9007199254740993000');
    expect(detail.signerAddresses).toEqual([]);
    expect(detail.participantAddresses).not.toContain('public-key-fixture');
    expect(http).toHaveBeenCalledTimes(1);
    expect(String(http.mock.calls[0][0])).toContain(`/cosmos/tx/v1beta1/txs/${hash}`);
  });
  it.each([undefined, null])('falls back to nested tx only when top-level is absent/null (%s)', async tx => {
    mockQueryHttp(() => ({ tx, tx_response: { ...fixture.tx_response, tx: fixture.tx } }));
    expect(await getTxDetail(hash)).toMatchObject({ txSource: 'nested', memo: 'Detailed fixture', selectedTx: fixture.tx });
  });
  it.each([false, [], 'invalid'])('discloses malformed top-level tx without silently using nested (%s)', async tx => {
    mockQueryHttp(() => ({ tx, tx_response: fixture.tx_response }));
    const detail = await getTxDetail(hash);
    expect(detail.txSource).toBe('invalid'); expect(detail.selectedTx).toBeNull();
    expect(detail.raw.tx).toEqual(tx);
  });
  it.each([undefined, null, '0', 0.5, {}])('does not invent success for missing or malformed code (%s)', async code => {
    mockQueryHttp(() => ({ tx_response: { code, txhash: hash, height: '42' } }));
    expect(await readQuery({ chain: 'fixture', target: hash }, () => getTxDetail(hash))).toMatchObject({ status: 'error', data: null });
  });
  it.each([{}, null, [], { tx_response: [] }, { tx_response: 'invalid' }])('fails invalid envelopes instead of an empty successful result', async payload => {
    mockQueryHttp(() => payload);
    expect(await readQuery({ chain: 'fixture', target: hash }, () => getTxDetail(hash))).toMatchObject({ status: 'error', data: null });
  });
  it.each([undefined, [], null, 'invalid'])('preserves missing/empty/malformed event fields (%s)', async events => {
    mockQueryHttp(() => ({ tx_response: { txhash: hash, height: '42', code: 9, raw_log: 'not JSON', events } }));
    expect(await getTxDetail(hash)).toMatchObject({ code: 9, rawLog: 'not JSON', events });
  });
  it('leaves list rows lightweight and never requests detail', async () => {
    const http = mockQueryHttp(() => ({ tx_responses: [fixture.tx_response], txs: [fixture.tx], total: '1' }));
    const { rows } = await getTransactionsAtHeight(42, apiClients);
    expect(rows[0]).not.toHaveProperty('raw'); expect(rows[0]).not.toHaveProperty('events');
    expect(http).toHaveBeenCalledTimes(1); expect(String(http.mock.calls[0][0])).toContain('/txs?');
  });
});
