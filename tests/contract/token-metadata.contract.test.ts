import { afterEach, describe, expect, it } from 'vitest';
import { getTokenMetadataByRef } from '@/server/handlers/token-metadata.handler';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
afterEach(restoreHttpBoundary);
describe('token metadata HTTP contract', () => {
  it('transforms native metadata', async () => {
    mockQueryHttp(() => ({ metadata: { base: 'uguru', name: 'Guru', symbol: 'GURU' } }));
    expect(await getTokenMetadataByRef('uguru')).toMatchObject({ status: 200, body: { tokenType: 'native', symbol: 'GURU' } });
  });
  it('preserves HTTP 404 without unsupported or synthetic fallback', async () => {
    mockQueryHttp(() => new Response('', { status: 404 }));
    await expect(getTokenMetadataByRef('uguru')).rejects.toMatchObject({ info: { kind: 'http', status: 404 } });
  });
  it('reports explicit unimplemented EVM metadata as unsupported without a request', async () => {
    const http = mockQueryHttp(() => ({}));
    await expect(getTokenMetadataByRef('evm:0x0000000000000000000000000000000000000002')).rejects.toMatchObject({ info: { kind: 'unsupported' } });
    expect(http).not.toHaveBeenCalled();
  });
});
