import { amountResponse, nativeMetadata } from './amounts';
import { block } from './query-http';

export const delegatedCoins = [{ denom: 'agxn', amount: '1000000000000000001' }, { denom: 'utest', amount: '1234567' }];
export const reviewMetadata = { metadatas: [...nativeMetadata.metadatas, { base: 'utest', display: 'test', symbol: 'TEST', denom_units: [{ denom: 'utest', exponent: 0 }, { denom: 'test', exponent: 6 }] }], pagination: { next_key: null } };
/** Successful sibling responses shared by metadata-only failure and public-address tests. */
export function amountReviewResponse(url: URL): unknown {
  const path = url.pathname;
  if (path.endsWith('/denoms_metadata')) return reviewMetadata;
  const amount = amountResponse(url);
  if (amount) return amount;
  if (path.includes('/balances/')) return { balances: [] };
  if (path.includes('/auth/')) return { account: { account_number: '1', sequence: '0' } };
  if (path.includes('/txs')) return { tx_responses: [] };
  if (path.includes('/blocks/')) return block('1');
  if (path.endsWith('/supply/by_denom')) return { amount: delegatedCoins[0] };
  if (path.endsWith('/pool')) return { pool: { bonded_tokens: '1000000000000000001' } };
  if (path.endsWith('/inflation')) return { inflation: '0.1' };
  if (path.endsWith('/outstanding_rewards')) return { rewards: { rewards: [{ denom: 'agxn', amount: '123.45' }] } };
  if (path.endsWith('/commission')) return { commission: { commission: [] } };
  if (path.includes('/unbonding_delegations/')) return { unbond: { entries: [] } };
  if (path.includes('/unbonding')) return { unbonding_responses: [] };
  if (path.includes('/rewards')) return { total: [], rewards: [] };
  if (path.includes('/delegations/')) return { delegation_responses: delegatedCoins.map(balance => ({ balance })), delegation_response: { balance: delegatedCoins[0] } };
  if (path.endsWith('/delegations')) return { delegation_responses: delegatedCoins.map(balance => ({ balance })) };
  const validator = { operator_address: 'v', tokens: '1000000000000000001', description: { moniker: 'Validator' } };
  if (path.endsWith('/validators')) return { validators: [validator] };
  if (path.endsWith('/validators/v')) return { validator };
  throw new Error(`Unexpected test URL: ${url}`);
}
