// Public synthetic values only. The wallet exposes no signing capability used by this run.
export const origin = process.env.BROWSER_ORIGIN || 'http://127.0.0.1:3261';
export const account = 'guru1w508d6qejxtdg4y5r3zarvary0c5xw7kz8hp7x';
export const pubkey = Array.from(Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex'));
export const validator = 'guruvaloper1w508d6qejxtdg4y5r3zarvary0c5xw7kfzv6ll';
export const hash = 'A'.repeat(64);
export const amount = '9007199254740993123456789';
export const rawTitle = '원문 Proposal title';
export const rawBody = '온체인 원문 Original on-chain content';
export const chain = {
  key: 'fixture', name: 'I18n fixture', chainId: 'i18n-fixture-1', lcdUrl: 'https://i18n.example/lcd', rpcUrl: 'https://i18n.example/rpc',
  bech32Prefix: 'guru', nativeDenom: 'agxn', bondDenom: 'agxn', feeDenom: 'agxn', decimals: 6,
  features: { bank: true, staking: true, distribution: true, governance: true, bex: true, feepolicy: true, oracle: true },
  signingProfile: { family: 'cosmos', chainVersion: 'synthetic-sdk', accountTypeUrl: '/cosmos.auth.v1beta1.BaseAccount', pubkeyTypeUrl: '/cosmos.crypto.secp256k1.PubKey', addressAlgorithm: 'cosmos', signModes: ['direct'], evidence: 'Synthetic test only' },
  signing: [{ wallet: 'keplr', method: 'direct', evidence: 'Synthetic test only' }],
  rpcAccess: { origin, get: true, post: true, options: true, observedAt: '2026-10-23', evidence: 'Synthetic test only' },
  sendFeePolicy: { mode: 'fixed', gasPrice: '0.001agxn', gas: 200000, evidence: 'Synthetic fee', limitation: 'Test only' },
};
export const validatorData = { operator_address: validator, description: { moniker: 'Original Validator', details: rawBody, website: 'https://example.test', identity: 'RAW-ID' }, tokens: amount, delegator_shares: '123.000000', status: 'BOND_STATUS_BONDED', jailed: false, min_self_delegation: '1', commission: { commission_rates: { rate: '0.1' } } };
export const proposal = { id: '1', title: rawTitle, summary: rawBody, status: 'PROPOSAL_STATUS_VOTING_PERIOD', submit_time: '2026-10-20T00:00:00Z', deposit_end_time: '2027-01-01T00:00:00Z', voting_start_time: '2026-10-21T00:00:00Z', voting_end_time: '2027-01-01T00:00:00Z', total_deposit: [{ amount, denom: 'agxn' }], final_tally_result: { yes_count: '1', no_count: '0', abstain_count: '0', no_with_veto_count: '0' } };
export function response(url) {
  const p = url.pathname;
  if (p.startsWith('/rpc')) return { jsonrpc: '2.0', id: 1, result: { node_info: { network: chain.chainId, version: '0.37.0' } } };
  if (p.endsWith('/node_info')) return { default_node_info: { network: chain.chainId }, application_version: { name: 'fixture', version: '1.0', build_deps: [] } };
  if (p.includes('/blocks/')) return { block_id: { hash: 'AQIDBA==' }, block: { header: { height: p.endsWith('/latest') ? '10' : p.split('/').at(-1), chain_id: chain.chainId, time: new Date(Date.parse('2026-10-23T00:00:00Z') + Number(p.endsWith('/latest') ? '10' : p.split('/').at(-1)) * 6000).toISOString(), proposer_address: 'AQIDBA==', version: { block: '11', app: '1' } }, data: { txs: [] }, evidence: { evidence: [] }, last_commit: { height: '9', round: 0, signatures: [] } } };
  if (p.endsWith('/denoms_metadata')) return { metadatas: [{ base: 'agxn', display: 'gxn', symbol: 'GXN', description: rawBody, denom_units: [{ denom: 'agxn', exponent: 0 }, { denom: 'gxn', exponent: 6 }] }], pagination: { next_key: null } };
  if (p.includes('/balances/') || p.includes('/spendable_balances/')) return { balances: [{ amount, denom: 'agxn' }], pagination: { next_key: null } };
  if (p.endsWith('/accounts')) return { accounts: [], pagination: { total: '123' } };
  if (p.includes('/accounts/')) return { account: { '@type': '/cosmos.auth.v1beta1.BaseAccount', address: account, account_number: '1', sequence: '0', pub_key: null } };
  if (p.endsWith('/validators')) return { validators: [validatorData], pagination: { next_key: null, total: '1' } };
  if (p.endsWith('/validators/'+validator)) return { validator: validatorData };
  if (p.endsWith('/delegations')) return { delegation_responses: [], pagination: { next_key: null } };
  if (p.includes('/delegations/') && !p.includes('/validators/')) return { delegation_responses: [], pagination: { next_key: null } };
  if (p.includes('/delegations/')) return { delegation_response: { delegation: { delegator_address: account, validator_address: validator }, balance: { amount: '1000000', denom: 'agxn' } } };
  if (p.includes('/unbonding_delegations/')) return { unbonding_responses: [], pagination: { next_key: null } };
  if (p.includes('/unbonding_delegations')) return { unbonding_responses: [], pagination: { next_key: null } };
  if (p.endsWith('/outstanding_rewards')) return { rewards: { rewards: [] } };
  if (p.endsWith('/commission')) return { commission: { commission: [] } };
  if (p.includes('/rewards/')) return { rewards: [] };
  if (p.endsWith('/rewards')) return { total: [], rewards: [] };
  if (p.endsWith('/pool')) return { pool: { bonded_tokens: amount, not_bonded_tokens: '0' } };
  if (p.endsWith('/inflation')) return { inflation: '0.012' };
  if (p.endsWith('/supply/by_denom')) return { amount: { amount, denom: 'agxn' } };
  if (p.endsWith('/proposals')) return { proposals: [proposal], pagination: { next_key: null } };
  if (p.endsWith('/proposals/1')) return { proposal };
  if (p.endsWith('/tally')) return { tally: proposal.final_tally_result };
  if (p.endsWith('/votes')) return { votes: [], pagination: { next_key: null } };
  if (p.includes('/votes/')) return { vote: { options: [] } };
  if (p.endsWith('/deposits')) return { deposits: [], pagination: { next_key: null } };
  if (/\/gov\/.*\/params\/voting$/.test(p)) return { voting_params: { voting_period: '120s' } };
  if (/\/gov\/.*\/params\/tallying$/.test(p)) return { tally_params: { quorum: '0.334', threshold: '0.5', veto_threshold: '0.334' } };
  if (/\/gov\/.*\/params\/deposit$/.test(p)) return { deposit_params: { min_deposit: [{ amount: '1', denom: 'agxn' }], max_deposit_period: '120s' } };
  if (p.endsWith('/channels')) return { channels: [{ port_id: 'transfer', channel_id: 'channel-1', state: 'STATE_OPEN', ordering: 'ORDER_UNORDERED', version: 'ics20-1', connection_hops: ['connection-0'], counterparty: { port_id: 'transfer', channel_id: 'channel-9' } }], pagination: { next_key: null } };
  if (p.endsWith('/txs')) return { tx_responses: [{ txhash: hash, height: '10', code: 0, gas_used: '123', gas_wanted: '200000', timestamp: '2026-10-23T00:00:00Z' }], txs: [], pagination: { next_key: null, total: '1' } };
  if (p.includes('/txs/')) return { tx_response: { txhash: hash, height: '10', code: 0, timestamp: '2026-10-23T00:00:00Z', gas_used: '123', gas_wanted: '200000', raw_log: rawBody }, tx: { body: { messages: [{ '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: account, to_address: account, amount: [{ amount, denom: 'agxn' }] }], memo: rawBody }, auth_info: { fee: { amount: [{ amount: '200', denom: 'agxn' }] } } } };
  if (p.endsWith('/exchanges')) return { exchanges: [{ id: '1', denom_a: 'agxn', denom_b: 'rawDenom', fee: '0.000000001', limit: amount, status: 'ACTIVE', oracle_request_id: '1' }] };
  if (p.endsWith('_fees')) return { coins: [{ amount, denom: 'agxn' }] };
  if (p.endsWith('/requests')) return { requests: [{ id: '1', symbol: 'RAW', category: 'rawCategory', nonce: '0', period: '123' }] };
  if (p.endsWith('/requests/1')) return { request: { id: '1', symbol: 'RAW', category: 'rawCategory', nonce: '0', period: '123' } };
  if (p.endsWith('/result')) return { result: { request_id: '1', nonce: '0', aggregated_time: amount, aggregated_data: '123.456789', aggregated_height: '10' } };
  if (p.endsWith('/reports')) return { reports: [{ request_id: '1', provider: account, nonce: '0', raw_data: rawBody, signature: 'rawSignature' }] };
  if (p.endsWith('/results')) return { results: [] };
  if (p.endsWith('/categories')) return { categories: ['rawCategory'] };
  if (p.endsWith('/whitelist')) return { addresses: [], count: '0' };
  if (p.endsWith('/moderator_address')) return { moderator_address: account };
  if (p.endsWith('/discounts')) return { discounts: [{ address: '', modules: [{ module: 'bank', discounts: [{ discount_type: 'percent', amount: '0.123456789' }] }] }] };
  if (p.endsWith('/params')) return { params: { bond_denom: 'agxn', unbonding_time: '86400s', enable: true } };
  if (p.endsWith('/constant_fee')) return { fee: { amount: '1', denom: 'agxn' } };
  return {};
}
