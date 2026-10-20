import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDecimal, displayToBase, formatCoin, sumCoins } from '@/lib/cosmos-amount';
import { getWalletPortfolio } from '@/services/guru/wallet-portfolio.service';
import { getDenomsMetadata } from '@/services/guru/token-metadata.service';
import { getNetworkSummary } from '@/services/guru/network-summary.service';
import { getUnbonding } from '@/services/guru/unbonding.service';
import { getGovParams } from '@/services/guru/governance-query.service';
import { getValidatorDetail } from '@/services/guru/staking.service';
import { readQuery } from '@/lib/query-result';
import { mockQueryHttp } from '../helpers/query-http';
import { mockNetworkSummaryHttp, restoreHttpBoundary } from '../helpers/network-summary';
import observed from '../fixtures/tgxn-2026-10-20/metadata.json';
import { amountResponse } from '../helpers/amounts';
const six = { baseDenom: 'utest', displayDenom: 'test', symbol: 'TEST', decimals: 6 };
const eighteen = { baseDenom: 'agxn', displayDenom: 'gxn', symbol: 'GXN', decimals: 18 };
afterEach(restoreHttpBoundary);
describe('AC02 exact decimal contract', () => {
  it('formats 6/18 places, huge values, fractional base rewards and floors at six places', () => {
    expect(formatCoin({ amount: '1234567', denom: 'utest' }, six)).toBe('1.234567 TEST');
    expect(formatCoin({ amount: '1000000000000000000', denom: 'agxn' }, eighteen)).toBe('1 GXN');
    expect(formatCoin({ amount: '123456789012345678900000000', denom: 'agxn' }, eighteen)).toBe('123456789.012345 GXN');
    expect(formatCoin({ amount: '123.45', denom: 'agxn' }, eighteen)).toBe('<0.000001 GXN');
    expect(formatCoin({ amount: '0', denom: 'agxn' }, eighteen)).toBe('0 GXN');
    expect(addDecimal('9007199254740993.99', '0.02')).toBe('9007199254740994.01');
    expect(sumCoins([{ denom: 'a', amount: '123.45' }, { denom: 'b', amount: '10' }, { denom: 'a', amount: '0.55' }])).toEqual([{ denom: 'a', amount: '124' }, { denom: 'b', amount: '10' }]);
  });
  it.each(['0','00','-1','1e3','0.0000001','1.0000000','01','NaN'])('rejects invalid 6-place display input %s', input => expect(() => displayToBase(input, 6)).toThrow());
  it('preserves huge integer conversion and rejects missing metadata/invalid raw', () => {
    expect(displayToBase('9007199254740993.123456', 6)).toBe('9007199254740993123456');
    expect(() => displayToBase('1', null)).toThrow();
    expect(() => formatCoin({ amount: 'bad', denom: 'agxn' }, eighteen)).toThrow();
    expect(formatCoin({ amount: '123.45', denom: 'other' }, eighteen)).toBe('123.45 other (정밀도 미확인)');
  });
  it('uses captured E08 metadata: missing exact display unit never implies max exponent or zero decimals', async () => {
    mockQueryHttp(() => ({ ...observed.response, pagination: { next_key: null } }));
    const metadata = await getDenomsMetadata();
    expect(metadata.find(m => m.baseDenom === 'agxn')?.decimals).toBe(18);
    const ibc = metadata.find(m => m.baseDenom.startsWith('ibc/'))!;
    expect(ibc.decimals).toBeNull();
    expect(formatCoin({ amount: '999999999999999999', denom: ibc.baseDenom }, ibc)).toBe(`999999999999999999 ${ibc.baseDenom} (정밀도 미확인)`);
  });
  it('E04 deployment denom mismatch uses native supply and current bond denom (synthetic quantities, recorded metadata)', async () => {
    const http = mockNetworkSummaryHttp();
    vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ key: 'fixture', name: 'Fixture', lcdUrl: 'https://lcd.example.test', denom: 'atgxn', nativeDenom: 'agxn' }]));
    const summary = await getNetworkSummary();
    expect(summary).toMatchObject({ supply: '123456789.012345 GXN', bonded: '4.5 GXN', supplyRaw: '123456789012345678900000000 agxn' });
    expect(http.mock.calls.some(([url]) => String(url).includes('denom=atgxn'))).toBe(false);
  });
  it('portfolio keeps every denom and decimal reward with raw details and dynamic unbonding params', async () => {
    mockQueryHttp(url => url.pathname.endsWith('/staking/v1beta1/params') ? { params: { bond_denom: 'agxn', unbonding_time: '172800s' } } : amountResponse(url) ?? (
      url.pathname.includes('/balances/') ? { balances: [{ denom: 'agxn', amount: '1000000000000000000' }, { denom: 'ibc/unknown', amount: '9007199254740993' }] } :
      url.pathname.includes('/rewards') ? { total: [{ denom: 'agxn', amount: '123.45' }, { denom: 'utest', amount: '0.55' }] } :
      url.pathname.includes('/unbonding') ? Response.json({ unbonding_responses: [{ validator_address: 'v', entries: [{ balance: '10', completion_time: '2027-01-01T00:00:00Z', creation_height: '7' }, { balance: '20', completion_time: '2027-01-02T00:00:00Z', creation_height: '8' }] }] }, { headers: { 'x-cosmos-block-height': '42' } }) : { delegation_responses: [] }));
    const snapshot = await getWalletPortfolio('a');
    expect(snapshot.balance).toContain('9007199254740993 ibc/unknown (정밀도 미확인)');
    expect(snapshot.reward).toBe('<0.000001 GXN, 0.55 utest (정밀도 미확인)');
    expect(snapshot.details?.reward?.[0].amount).toBe('123.45');
    expect(snapshot.details).toMatchObject({ unbondingTime: '172800s', unbonding: { total: { amount: '30', denom: 'agxn' }, queryHeight: '42', entries: [{ completionTime: '2027-01-01T00:00:00Z', queryHeight: '42' }, { completionTime: '2027-01-02T00:00:00Z', queryHeight: '42' }] } });
  });
  it.each([false, true])('paginated unbonding exposes missing/inconsistent height without fabrication: %s', mismatch => {
    const http = mockQueryHttp(url => Response.json({ unbonding_responses: [{ entries: [{ balance: url.searchParams.has('pagination.key') ? '2' : '1', completion_time: '2020-01-01T00:00:00Z' }] }], pagination: { next_key: url.searchParams.has('pagination.key') ? null : 'next' } }, { headers: mismatch ? { 'x-cosmos-block-height': url.searchParams.has('pagination.key') ? '43' : '42' } : {} }));
    return getUnbonding('a', 'agxn').then(result => {
      expect(result).toMatchObject({ total: { amount: '3' }, queryHeight: null });
      expect(result.entries).toHaveLength(2);
      if (mismatch) expect(http.mock.calls[1][1]?.headers).toEqual({ 'x-cosmos-block-height': '42' });
    });
  });
  it('metadata outage retains raw amount; malformed rewards are unavailable, never zero', async () => {
    mockQueryHttp(url => url.pathname.includes('denoms_metadata') ? new Response('', { status: 503 }) : amountResponse(url) ?? (url.pathname.includes('/balances/') ? { balances: [{ denom: 'agxn', amount: '123' }] } : url.pathname.includes('/rewards') ? { total: [{ denom: 'agxn', amount: 'invalid' }] } : url.pathname.includes('/unbonding') ? { unbonding_responses: [] } : { delegation_responses: [] }));
    expect(await readQuery({ chain: 'fixture', target: 'portfolio' }, () => getWalletPortfolio('a'))).toMatchObject({ status: 'partial', data: { balance: '123 agxn (정밀도 미확인)', reward: '—' } });
  });
  it('validator retains reward decimals and different denoms', async () => {
    mockQueryHttp(url => amountResponse(url) ?? (url.pathname.endsWith('/outstanding_rewards') ? { rewards: { rewards: [{ denom: 'agxn', amount: '123.45' }, { denom: 'utest', amount: '7' }] } } : url.pathname.endsWith('/commission') ? { commission: { commission: [] } } : url.pathname.endsWith('/delegations') ? { delegation_responses: [{ balance: { denom: 'agxn', amount: '1' } }, { balance: { denom: 'utest', amount: '2' } }] } : { validator: { operator_address: 'v', tokens: '3' } }));
    const detail = await getValidatorDetail('v');
    expect(detail?.amountCoins?.outstandingRewardsAmount).toEqual([{ denom: 'agxn', amount: '123.45' }, { denom: 'utest', amount: '7' }]);
    expect(detail?.amountCoins?.totalDelegationAmount).toHaveLength(2);
  });
  it('uses current gov periods and deposits instead of the observed sample', async () => {
    mockQueryHttp(url => url.pathname.endsWith('/voting') ? { voting_params: { voting_period: '120s' } } : url.pathname.endsWith('/deposit') ? { deposit_params: { max_deposit_period: '360s', min_deposit: [{ denom: 'utest', amount: '7654321' }] } } : { tally_params: { quorum: '0.1', threshold: '0.5', veto_threshold: '0.3' } });
    expect(await getGovParams()).toMatchObject({ voting: { votingPeriod: '120s' }, deposit: { maxDepositPeriod: '360s', minDeposit: [{ denom: 'utest', amount: '7654321' }] } });
  });
});
