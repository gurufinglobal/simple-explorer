import { afterEach, describe, expect, it } from 'vitest';
import { listProposals, getGovParams } from '@/services/guru/governance-query.service';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
afterEach(restoreHttpBoundary);
describe('governance HTTP contract', () => {
  it('maps a v1 proposal', async () => {
    mockQueryHttp(() => ({ proposals: [{ id: '1', title: 'Fixture proposal', summary: 'Summary', status: 'PROPOSAL_STATUS_VOTING_PERIOD' }] }));
    expect(await listProposals()).toMatchObject([{ id: '1', title: 'Fixture proposal', status: 'voting_period' }]);
  });
  it('preserves a successful empty list without probing legacy', async () => {
    const http = mockQueryHttp(() => ({ proposals: [] }));
    expect(await listProposals()).toEqual([]); expect(http).toHaveBeenCalledTimes(1);
  });
  it('falls back only on v1 404 and preserves legacy errors', async () => {
    const http = mockQueryHttp(url => new Response('', { status: url.pathname.includes('/v1/') ? 404 : 500 }));
    await expect(listProposals()).rejects.toMatchObject({ info: { kind: 'http', status: 500 } }); expect(http).toHaveBeenCalledTimes(2);
  });
  it('does not hide v1 500 behind legacy results', async () => {
    const http = mockQueryHttp(() => new Response('', { status: 500 }));
    await expect(listProposals()).rejects.toMatchObject({ info: { status: 500 } }); expect(http).toHaveBeenCalledTimes(1);
  });
  it('maps params from HTTP', async () => {
    mockQueryHttp(url => url.pathname.endsWith('/voting') ? { voting_params: { voting_period: '120h' } } : url.pathname.endsWith('/tallying') ? { tally_params: { quorum: '0.33', threshold: '0.5', veto_threshold: '0.334' } } : { deposit_params: { min_deposit: [{ denom: 'agxn', amount: '100' }] } });
    expect(await getGovParams()).toMatchObject({ voting: { votingPeriod: '120h' }, tallying: { quorum: '0.33' }, deposit: { minDeposit: [{ denom: 'agxn', amount: '100' }] } });
  });
});
