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
  for (const [pattern, field] of arrays) if (pattern.test(route) && !Array.isArray(body[field])) schemaError(`응답의 ${field} 목록이 올바르지 않습니다.`);
  const objects: [RegExp, string][] = [
    [/\/blocks\/[^/]+$/, 'block'], [/\/txs\/[^/]+$/, 'tx_response'],
    [/\/validators\/[^/]+$/, 'validator'], [/\/proposals\/[^/]+$/, 'proposal'],
    [/\/denoms_metadata\/[^/]+$/, 'metadata'], [/\/denom_traces\/[^/]+$/, 'denom_trace'],
    [/\/accounts\/[^/]+$/, 'account'], [/\/requests\/[^/]+$/, 'request'],
    [/\/discounts\/[^/]+$/, 'discount'], [/\/params$/, 'params'], [/\/tally$/, 'tally'],
  ];
  for (const [pattern, field] of objects) if (pattern.test(route) && (!body[field] || typeof body[field] !== 'object')) schemaError(`응답의 ${field}가 올바르지 않습니다.`);
  if (/\/blocks\/[^/]+$/.test(route)) {
    const header = (body.block as { header?: { height?: string; time?: string } }).header;
    if (!header?.height || !/^\d+$/.test(header.height) || !header.time || !Number.isFinite(Date.parse(header.time))) schemaError('블록 높이/시각이 올바르지 않습니다.');
  }
  const objectRows = ['balances', 'metadatas', 'tx_responses', 'validators', 'channels', 'proposals', 'votes', 'deposits', 'exchanges', 'discounts', 'requests', 'reports', 'results', 'coins'];
  for (const field of objectRows) {
    // Governance history validates individual rows in its mapper to retain partial data.
    if ((field === 'votes' || field === 'deposits') && /^\/cosmos\/gov\/v1(?:beta1)?\/proposals\/[^/]+\/(?:votes|deposits)$/.test(route)) continue;
    if (Array.isArray(body[field]) && (body[field] as unknown[]).some(row => !row || typeof row !== 'object' || Array.isArray(row))) schemaError(`응답의 ${field} 항목이 올바르지 않습니다.`);
  }
  const rows = (field: string) => (body[field] ?? []) as Record<string, unknown>[];
  if (rows('balances').some(row => typeof row.denom !== 'string' || typeof row.amount !== 'string' || !/^\d+$/.test(row.amount))) schemaError('잔액 응답이 올바르지 않습니다.');
  if (rows('metadatas').some(row => typeof row.base !== 'string' || !row.base.trim())) schemaError('Metadata base denom이 없습니다.');
  if (rows('validators').some(row => typeof row.operator_address !== 'string')) schemaError('검증자 주소가 없습니다.');
  if (rows('proposals').some(row => row.id === undefined && row.proposal_id === undefined)) schemaError('제안 ID가 없습니다.');
  if (rows('channels').some(row => typeof row.channel_id !== 'string' || typeof row.port_id !== 'string')) schemaError('IBC 채널 식별자가 없습니다.');
  if (rows('exchanges').some(row => row.id === undefined)) schemaError('Exchange ID가 없습니다.');
  if (rows('requests').some(row => row.id === undefined)) schemaError('Oracle request ID가 없습니다.');
  if (rows('discounts').some(row => typeof row.address !== 'string')) schemaError('할인 대상 주소가 없습니다.');
  if (rows('coins').some(row => typeof row.denom !== 'string' || typeof row.amount !== 'string')) schemaError('Coin 응답이 올바르지 않습니다.');
  const txs = body.tx_response ? [body.tx_response as Record<string, unknown>] : rows('tx_responses');
  if (txs.some(row => typeof row.txhash !== 'string' || typeof row.code !== 'number' || !Number.isInteger(row.code) || typeof row.height !== 'string')) schemaError('거래 상태/해시/높이가 올바르지 않습니다.');
  if (/\/moderator_address$/.test(route) && typeof (body.moderator_address ?? body.moderatorAddress) !== 'string') schemaError('Moderator 응답이 올바르지 않습니다.');
  if (/\/node_info$/.test(route) && (!body.default_node_info || !body.application_version)) schemaError('Node info 응답이 올바르지 않습니다.');
  if (/\/result$/.test(route) && !("result" in body)) schemaError('Oracle result 응답이 올바르지 않습니다.');
  if (/\/params\/(voting|tallying|deposit)$/.test(route)) {
    const key = route.endsWith('/voting') ? 'voting_params' : route.endsWith('/tallying') ? 'tally_params' : 'deposit_params';
    if (!body[key] || typeof body[key] !== 'object') schemaError(`응답의 ${key}가 올바르지 않습니다.`);
  }
  return value;
}
