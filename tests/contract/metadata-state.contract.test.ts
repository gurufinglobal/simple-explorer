import { afterEach, describe, expect, it } from 'vitest';
import { readQuery } from '@/lib/query-result';
import { getWalletPortfolio } from '@/services/guru/wallet-portfolio.service';
import { getNetworkSummary } from '@/services/guru/network-summary.service';
import { getTopValidators, getValidatorDetail, getDelegatorValidatorPosition } from '@/services/guru/staking.service';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
import { amountReviewResponse, delegatedCoins, reviewMetadata } from '../helpers/amount-review';
const context = { chain: 'fixture', target: 'metadata-state' };
const loaders = [
  ['portfolio', () => getWalletPortfolio('a')],
  ['network', () => getNetworkSummary()],
  ['validators', () => getTopValidators()],
  ['validator detail', () => getValidatorDetail('v')],
  ['delegator position', () => getDelegatorValidatorPosition('a', 'v')],
] as const;
afterEach(restoreHttpBoundary);
describe.each(loaders)('R1 metadata state: %s', (_name, load) => {
  it.each(['outage', 'later page', 'empty'] as const)('%s keeps successful raw values and distinguishes absent metadata from failure', async mode => {
    mockQueryHttp(url => {
      if (!url.pathname.endsWith('/denoms_metadata')) return amountReviewResponse(url);
      if (mode === 'empty') return { metadatas: [] };
      if (mode === 'later page' && !url.searchParams.has('pagination.key')) return { ...reviewMetadata, pagination: { next_key: 'next' } };
      return new Response('', { status: 503 });
    });
    const result = await readQuery<unknown>(context, load);
    expect(result.status).toBe(mode === 'empty' ? 'success' : 'partial');
    expect(JSON.stringify(result.data)).toContain(delegatedCoins[0].amount);
    if (mode === 'empty') expect(result.error).toBeNull();
    else expect(result.error).toMatchObject({ kind: 'http', status: 503, message: expect.stringContaining('Metadata') });
    if (mode === 'later page') expect(JSON.stringify(result.data)).toContain('GXN');
  });
  it.each([false, true])('cancellation remains cancelled, including after a successful page: %s', async later => {
    mockQueryHttp(url => {
      if (!url.pathname.endsWith('/denoms_metadata')) return amountReviewResponse(url);
      if (later && !url.searchParams.has('pagination.key')) return { ...reviewMetadata, pagination: { next_key: 'next' } };
      throw new DOMException('Aborted', 'AbortError');
    });
    expect(await readQuery<unknown>(context, load)).toMatchObject({ status: 'cancelled', data: null, error: { kind: 'cancelled' } });
  });
});
it('R1 preserves retry timing, raw details, stale data and recovery across metadata-only failures', async () => {
  let failed = true;
  mockQueryHttp(url => failed && url.pathname.endsWith('/denoms_metadata') ? new Response('', { status: 429, headers: { 'retry-after': '10' } }) : amountReviewResponse(url));
  const partial = await readQuery(context, () => getWalletPortfolio('a'));
  expect(partial).toMatchObject({ status: 'partial', data: { details: { staking: delegatedCoins, metadata: [] } }, error: { status: 429 } });
  expect(partial.error!.retryAt).toBeGreaterThan(Date.now());
  failed = false;
  const success = await readQuery(context, () => getWalletPortfolio('a'), partial);
  expect(success).toMatchObject({ status: 'success', error: null, data: { staking: '1 GXN, 1.234567 TEST' } });
  failed = true;
  const stale = await readQuery(context, () => getWalletPortfolio('a'), success);
  expect(stale).toMatchObject({ status: 'stale', data: success.data, observedAt: success.observedAt, error: { status: 429 } });
});

it('R1 combines metadata and sibling failures without discarding either cause or successful raw coins', async () => {
  mockQueryHttp(url => url.pathname.endsWith('/denoms_metadata') ? new Response('', { status: 503 }) : url.pathname.endsWith('/rewards') ? new Response('', { status: 500 }) : amountReviewResponse(url));
  const result = await readQuery(context, () => getWalletPortfolio('a'));
  expect(result).toMatchObject({ status: 'partial', data: { reward: '—', details: { staking: delegatedCoins } }, error: { causes: [{ status: 503 }, { status: 500 }] } });
});
