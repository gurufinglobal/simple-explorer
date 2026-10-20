import { afterEach, describe, expect, it } from 'vitest';
import { getIbcChannelsPayload } from '@/server/handlers/ibc-channels.handler';
import { mockQueryHttp } from '../helpers/query-http';
import { restoreHttpBoundary } from '../helpers/network-summary';
afterEach(restoreHttpBoundary);
describe('IBC HTTP contract', () => {
  it('maps channels from LCD', async () => {
    mockQueryHttp(() => ({ channels: [{ port_id: 'transfer', channel_id: 'channel-1', state: 'STATE_OPEN', ordering: 'ORDER_UNORDERED', counterparty: { port_id: 'transfer', channel_id: 'channel-2' } }] }));
    expect(await getIbcChannelsPayload()).toMatchObject({ status: 200, body: { channels: [{ channelId: 'channel-1', state: 'OPEN', ordering: 'UNORDERED' }] } });
  });
  it('distinguishes empty from error', async () => {
    const http = mockQueryHttp(() => ({ channels: [] }));
    expect(await getIbcChannelsPayload()).toMatchObject({ body: { channels: [] } });
    http.mockResolvedValue(new Response('', { status: 404 }));
    await expect(getIbcChannelsPayload()).rejects.toMatchObject({ info: { kind: 'http', status: 404 } });
  });
});
