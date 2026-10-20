import { afterEach, describe, expect, it } from 'vitest';
import { getBexExchangeById, listBexExchanges } from '@/services/guru/bex.service';
import { getOracleParams, listOracleRequests } from '@/services/guru/oracle.service';
import { listFeePolicyDiscounts } from '@/services/guru/feepolicy.service';
import { getChainParamsSections } from '@/services/cosmos/params.service';
import { getValidatorDetail } from '@/services/guru/staking.service';
import { getWalletPortfolio } from '@/services/guru/wallet-portfolio.service';
import { readQuery } from '@/lib/query-result';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
import bex from '../fixtures/tgxn-2026-10-20/bex.json';
import oracle from '../fixtures/tgxn-2026-10-20/oracle.json';
import fee from '../fixtures/tgxn-2026-10-20/feepolicy.json';
const context = { chain: 'fixture', target: 'modules' };
afterEach(restoreHttpBoundary);
describe('module query states via real HTTP transforms', () => {
  it('maps observed BEX, Oracle and FeePolicy fixtures', async () => {
    mockQueryHttp(url => url.pathname.includes('/bex/') ? bex.response : url.pathname.includes('/oracle/') ? oracle.response : fee.response);
    expect((await listBexExchanges())[0]).toMatchObject({ id: '1', fee: '0.006000000000000000' });
    expect(await getBexExchangeById('1')).toMatchObject({ id: '1' });
    expect(await getOracleParams()).toMatchObject({ enable: true, quorumRatio: '0.666666666666666667' });
    expect((await listFeePolicyDiscounts())[0].modules[0].discounts[0].discountType).toBe('percent');
  });
  it.each([['bex', listBexExchanges], ['oracle', () => listOracleRequests()], ['feepolicy', listFeePolicyDiscounts]] as const)('%s 404 is an error, not unsupported', async (_name, load) => {
    mockQueryHttp(() => new Response('', { status: 404 }));
    const result = await readQuery<unknown>(context, load);
    expect(result).toMatchObject({ status: 'error', error: { kind: 'http', status: 404 }, data: null });
  });
  it('preserves successful Params sections with HTTP details and no unsupported inference', async () => {
    mockQueryHttp(url => url.pathname.includes('/oracle/') ? new Response('', { status: 500 }) : url.pathname.endsWith('/voting') ? { voting_params: {} } : url.pathname.endsWith('/tallying') ? { tally_params: {} } : url.pathname.endsWith('/deposit') ? { deposit_params: {} } : { params: {} });
    const result = await readQuery(context, () => getChainParamsSections());
    expect(result.status).toBe('partial');
    expect(result.data?.find(row => row.key === 'bank')).toMatchObject({ status: 'ok', data: { params: {} } });
    expect(result.data?.find(row => row.key === 'oracle')).toMatchObject({ status: 'error', error: { kind: 'http', status: 500 } });
  });
  it('keeps validator core data when rewards fail', async () => {
    mockQueryHttp(url => {
      if (url.pathname.endsWith('/outstanding_rewards')) return new Response('', { status: 500 });
      if (url.pathname.endsWith('/commission')) return { commission: { commission: [] } };
      if (url.pathname.endsWith('/delegations')) return { delegation_responses: [], pagination: { next_key: null } };
      return { validator: { operator_address: 'invalid-fixture-operator', description: { moniker: 'Fixture validator' }, tokens: '0' } };
    });
    expect(await readQuery(context, () => getValidatorDetail('invalid-fixture-operator'))).toMatchObject({ status: 'partial', data: { moniker: 'Fixture validator', totalDelegationAmount: '0', outstandingRewardsAmount: '-' }, error: { status: 500 } });
  });
  it('preserves portfolio zero balance and marks failed reward as unavailable', async () => {
    mockQueryHttp(url => url.pathname.includes('/balances/') ? { balances: [] } : url.pathname.endsWith('/rewards') ? new Response('', { status: 500 }) : url.pathname.includes('/unbonding_delegations') ? { unbonding_responses: [] } : { delegation_responses: [] });
    expect(await readQuery(context, () => getWalletPortfolio('a'))).toMatchObject({ status: 'partial', data: { balance: '0 gxn', staking: '0 gxn', reward: '—' }, error: { status: 500 } });
  });
});
