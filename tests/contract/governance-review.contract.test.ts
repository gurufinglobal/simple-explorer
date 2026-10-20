import { afterEach, describe, expect, it } from 'vitest';
import { getProposal, listProposals, listVotes, listDeposits, type GovernanceVoteRow, type GovernanceDepositRow } from '@/services/guru/governance-query.service';
import { readQuery } from '@/lib/query-result';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';

afterEach(restoreHttpBoundary);
const legacy = { proposal_id: '7', content: { title: 'Legacy title', description: 'Legacy summary' }, status: 'PROPOSAL_STATUS_VOTING_PERIOD' };

describe('governance review regressions through HTTP', () => {
  it.each(['list', 'detail'] as const)('preserves legacy %s identity and content after v1 404', async mode => {
    const http = mockQueryHttp(url => url.pathname.includes('/v1/') ? new Response('', { status: 404 }) : mode === 'list' ? { proposals: [legacy] } : { proposal: legacy });
    const value = mode === 'list' ? (await listProposals())[0] : await getProposal('7');
    expect(value).toMatchObject({ id: '7', title: 'Legacy title', summary: 'Legacy summary' });
    expect(http).toHaveBeenCalledTimes(2);
  });
  it('preserves v1 detail and does not hide detail HTTP/schema failures with fallback', async () => {
    const http = mockQueryHttp(() => ({ proposal: { id: '7', title: 'V1 title', summary: 'V1 summary' } }));
    expect(await getProposal('7')).toMatchObject({ id: '7', title: 'V1 title', summary: 'V1 summary' });
    for (const status of [429, 500]) {
      http.mockResolvedValue(new Response('', { status }));
      await expect(getProposal('7')).rejects.toMatchObject({ info: { kind: 'http', status } });
    }
    http.mockResolvedValue(Response.json({}));
    await expect(getProposal('7')).rejects.toMatchObject({ info: { kind: 'schema' } });
    expect(http).toHaveBeenCalledTimes(4);
  });

  for (const kind of ['votes', 'deposits'] as const) {
    const load = (): Promise<(GovernanceVoteRow | GovernanceDepositRow)[]> => kind === 'votes' ? listVotes('7') : listDeposits('7');
    const context = { chain: 'fixture', target: `${kind}:7` };
    const valid = kind === 'votes' ? { voter: 'guru1voter', option: 'VOTE_OPTION_YES' } : { depositor: 'guru1depositor', amount: [{ denom: 'agxn', amount: '12' }] };
    const expected = kind === 'votes' ? { voter: 'guru1voter', optionDisplay: 'VOTE_OPTION_YES' } : { depositor: 'guru1depositor', amountDisplay: '12 agxn' };
    const wrapped = kind === 'votes' ? { vote: valid } : { deposit: valid };
    it(`${kind}: keeps a true empty response`, async () => {
      const http = mockQueryHttp(() => ({ [kind]: [] }));
      expect(await readQuery(context, load)).toMatchObject({ status: 'empty', data: [], error: null });
      expect(http).toHaveBeenCalledTimes(1);
    });
    it(`${kind}: rejects malformed identifiers and wrappers as schema errors`, async () => {
      const http = mockQueryHttp(() => ({ [kind]: [{}] }));
      const id = kind === 'votes' ? 'voter' : 'depositor';
      const wrapper = kind === 'votes' ? 'vote' : 'deposit';
      for (const row of [{}, { [id]: '' }, { [id]: '  ' }, { [id]: 7 }, { [id]: {} }, { [wrapper]: {} }, { [wrapper]: 'invalid' }, null, []]) {
        http.mockResolvedValue(Response.json({ [kind]: [row] }));
        expect(await readQuery(context, load)).toMatchObject({ status: 'error', data: null, error: { kind: 'schema' } });
      }
    });
    it.each([false, true])(`${kind}: preserves direct/wrapped valid data in a mixed response (legacy=%s)`, async legacyVersion => {
      mockQueryHttp(url => legacyVersion && url.pathname.includes('/v1/') ? new Response('', { status: 404 }) : { [kind]: [valid, {}, wrapped, null] });
      expect(await readQuery(context, load)).toMatchObject({ status: 'partial', data: [expected, expected], error: { kind: 'schema' } });
    });
    it(`${kind}: preserves wrapper compatibility on a successful response`, async () => {
      mockQueryHttp(() => ({ [kind]: [wrapped] }));
      expect(await readQuery(context, load)).toMatchObject({ status: 'success', data: [expected], error: null });
    });
  }
});
