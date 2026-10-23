
import { serviceText } from '@/i18n/service-message';
import { schemaError } from '@/lib/query-result';

/** Check response containers before service defaults can turn malformed JSON into empty/zero. */
export function validateLcdJson<T>(path: string, value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) schemaError();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length === 0) schemaError();
  const route = path.split('?')[0];
  const arrays: [RegExp, string][] = [
    [/\/denoms_metadata$/, 'metadatas'], [/\/balances\/[^/]+$/, 'balances'],
    [/\/txs$/, 'tx_responses'], [/\/validators$/, 'validators'], [/\/channels$/, 'channels'],
    [/\/proposals$/, 'proposals'], [/\/votes$/, 'votes'], [/\/deposits$/, 'deposits'],
    [/\/exchanges$/, 'exchanges'], [/\/discounts$/, 'discounts'], [/\/requests$/, 'requests'],
    [/\/whitelist$/, 'addresses'], [/\/collected_fees$|\/locked_fees$|\/available_fees$/, 'coins'], [/\/reports$/, 'reports'], [/\/results$/, 'results'], [/\/categories$/, 'categories'],
  ];
  for (const [pattern, field] of arrays) if (pattern.test(route) && !Array.isArray(body[field])) schemaError(serviceText("invalid_list_in_the_response", { value0: String(field) }));
  const objects: [RegExp, string][] = [
    [/\/blocks\/[^/]+$/, 'block'], [/\/txs\/[^/]+$/, 'tx_response'],
    [/\/validators\/[^/]+$/, 'validator'], [/\/proposals\/[^/]+$/, 'proposal'],
    [/\/denoms_metadata\/[^/]+$/, 'metadata'], [/\/denom_traces\/[^/]+$/, 'denom_trace'],
    [/\/accounts\/[^/]+$/, 'account'], [/\/requests\/[^/]+$/, 'request'],
    [/\/discounts\/[^/]+$/, 'discount'], [/\/params$/, 'params'], [/\/tally$/, 'tally'],
  ];
  for (const [pattern, field] of objects) if (pattern.test(route) && (!body[field] || typeof body[field] !== 'object')) schemaError(serviceText("invalid_in_the_response", { value0: String(field) }));
  if (/\/blocks\/[^/]+$/.test(route)) {
    const header = (body.block as { header?: { height?: string; time?: string } }).header;
    if (!header?.height || !/^\d+$/.test(header.height) || !header.time || !Number.isFinite(Date.parse(header.time))) schemaError(serviceText("invalid_block_height_or_time"));
  }
  const objectRows = ['balances', 'metadatas', 'tx_responses', 'validators', 'channels', 'proposals', 'votes', 'deposits', 'exchanges', 'discounts', 'requests', 'reports', 'results', 'coins'];
  for (const field of objectRows) {
    // Governance history validates individual rows in its mapper to retain partial data.
    if ((field === 'votes' || field === 'deposits') && /^\/cosmos\/gov\/v1(?:beta1)?\/proposals\/[^/]+\/(?:votes|deposits)$/.test(route)) continue;
    // These exact response rows are checked by moduleRows/field mappers to preserve valid siblings.
    if ((field === 'exchanges' && route === '/guru/bex/v1/exchanges') ||
      (field === 'coins' && /^\/guru\/bex\/v1\/(collected|locked|available)_fees$/.test(route)) ||
      (field === 'discounts' && route === '/guru/feepolicy/v1/discounts') ||
      (field === 'requests' && route === '/guru/oracle/v2/requests') ||
      (['reports', 'results'].includes(field) && new RegExp('^/guru/oracle/v2/requests/[^/]+/' + field + '$').test(route))) continue;
    if (Array.isArray(body[field]) && (body[field] as unknown[]).some(row => !row || typeof row !== 'object' || Array.isArray(row))) schemaError(serviceText("invalid_entry_in_the_response", { value0: String(field) }));
  }
  const rows = (field: string) => (body[field] ?? []) as Record<string, unknown>[];
  if (rows('balances').some(row => typeof row.denom !== 'string' || typeof row.amount !== 'string' || !/^\d+$/.test(row.amount))) schemaError(serviceText("invalid_balance_response"));
  if (rows('metadatas').some(row => typeof row.base !== 'string' || !row.base.trim())) schemaError(serviceText("metadata_base_denom_missing"));
  if (rows('validators').some(row => typeof row.operator_address !== 'string')) schemaError(serviceText("validator_address_missing"));
  if (rows('proposals').some(row => row.id === undefined && row.proposal_id === undefined)) schemaError(serviceText("proposal_id_missing"));
  if (rows('channels').some(row => typeof row.channel_id !== 'string' || typeof row.port_id !== 'string')) schemaError(serviceText("ibc_channel_identifier_missing"));
  const txs = body.tx_response ? [body.tx_response as Record<string, unknown>] : rows('tx_responses');
  if (txs.some(row => typeof row.txhash !== 'string' || typeof row.code !== 'number' || !Number.isInteger(row.code) || typeof row.height !== 'string')) schemaError(serviceText("invalid_transaction_status_hash_or_height"));
  if (/\/moderator_address$/.test(route) && typeof (body.moderator_address ?? body.moderatorAddress) !== 'string') schemaError(serviceText("invalid_moderator_response"));
  if (/\/node_info$/.test(route) && (!body.default_node_info || !body.application_version)) schemaError(serviceText("invalid_node_info_response"));
  if (/\/result$/.test(route) && !("result" in body)) schemaError(serviceText("invalid_oracle_result_response"));
  if (/\/params\/(voting|tallying|deposit)$/.test(route)) {
    const key = route.endsWith('/voting') ? 'voting_params' : route.endsWith('/tallying') ? 'tally_params' : 'deposit_params';
    const container = route.startsWith('/cosmos/gov/v1/') ? body.params ?? body[key] : body[key];
    if (!container || typeof container !== 'object' || Array.isArray(container)) schemaError(serviceText("invalid_params_in_the_response", { value0: String(key) }));
  }
  return value;
}
