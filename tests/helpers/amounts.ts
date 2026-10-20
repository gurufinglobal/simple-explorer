import observed from '../fixtures/tgxn-2026-10-20/metadata.json';
export const nativeMetadata = { metadatas: [observed.response.metadatas[0]], pagination: { next_key: null } };
export const stakingParams = { params: { bond_denom: 'agxn', unbonding_time: '86400s' } };
export function amountResponse(url: URL): unknown | undefined {
  if (url.pathname.endsWith('/denoms_metadata')) return nativeMetadata;
  if (url.pathname.endsWith('/staking/v1beta1/params')) return stakingParams;
  return undefined;
}
