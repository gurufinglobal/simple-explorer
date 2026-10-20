import { vi } from 'vitest';
export function mockQueryHttp(handler: (url: URL) => unknown | Response | Promise<unknown | Response>) {
  vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ key: 'fixture', name: 'Fixture', lcdUrl: 'https://lcd.example.test', denom: 'agxn' }]));
  vi.stubEnv('NEXT_PUBLIC_DEFAULT_CHAIN_KEY', 'fixture');
  const http = vi.fn<typeof fetch>(async input => {
    const response = await handler(new URL(String(input)));
    return response instanceof Response ? response : Response.json(response);
  });
  vi.stubGlobal('fetch', http);
  return http;
}
export const block = (height = '3') => ({ block_id: { hash: `BLOCK-${height}` }, block: { header: { height, chain_id: 'fixture-chain', time: `2026-01-01T00:00:0${height}Z` }, data: { txs: [] } } });
export const transaction = { tx_response: { txhash: 'A'.repeat(64), code: 0, height: '3', gas_used: '1', gas_wanted: '2' }, tx: { body: { messages: [], memo: 'fixture' } } };
