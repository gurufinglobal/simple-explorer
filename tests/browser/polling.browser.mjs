// Chrome production UI with synthetic LCD and visibility boundary; no signer/broadcast.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.BROWSER_ORIGIN || 'http://127.0.0.1:3248';
const output = process.env.BROWSER_OUTPUT || '/tmp/gura48-evidence/browser';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
 for (const width of [360, 768, 1280]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  let height = 150, failing = false, requests = [];
  await context.route(/^https:\/\/[ab]\.example\//, async route => {
   const url = new URL(route.request().url()); requests.push(url.href);
   if (failing) { await route.fulfill({ status: 429, headers: { 'Retry-After': '3' }, body: '' }); return; }
   let json;
   if (url.pathname.includes('/blocks/')) {
    const h = url.pathname.endsWith('/latest') ? height : Number(url.pathname.split('/').at(-1));
    json = { block_id: { hash: 'ABCD' }, block: { header: { height: String(h), time: new Date(1760000000000 + h * 3000).toISOString(), chain_id: 'guru-fixture' }, data: { txs: [] } } };
   } else if (url.pathname.endsWith('/txs')) {
    const h = Number(url.searchParams.get('query')?.split('=')[1]);
    const rows = h % 20 === 0 ? [{ txhash: h.toString(16).padStart(64, 'A'), code: 0, height: String(h), gas_used: '1', gas_wanted: '2' }] : [];
    json = { tx_responses: rows, txs: [], total: String(rows.length) };
   }
   else if (url.pathname.endsWith('/node_info')) json = { default_node_info: { network: 'guru-fixture' }, application_version: {} };
   else { await route.fulfill({ status: 503, body: '' }); return; }
   await route.fulfill({ json });
  });
  for (const routeName of ['blocks', 'transactions']) {
   height = 150; requests = [];
   await page.goto(`${origin}/${routeName}?chain=a`);
   const info = page.getByRole('region', { name: 'HTTP 폴링 조회 정보' });
   await info.getByText(/마지막 API 성공:.*높이 150/).waitFor();
   const initial = requests.length;
   await info.getByText(/직전 성공 조회와 높이 동일/).waitFor();
   const unchanged = requests.length - initial;
   assert.equal(unchanged, 1);
   await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
   await info.getByText('일시 중지: 숨긴 탭').waitFor();
   const hiddenCount = requests.length;
   await page.waitForTimeout(3500);
   assert.equal(requests.length, hiddenCount);
   height = 210;
   await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange')); });
   await info.getByText(/마지막 API 성공:.*높이 210/).waitFor();
   assert.equal(requests.length - hiddenCount, 61);
   if (routeName === 'blocks') for (let h = 151; h <= 210; h++) assert.equal(await page.getByText(`#${h}`, { exact: true }).count(), 1);
   const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
   assert(size.scroll <= size.width, `${routeName}/${width}: overflow`);
   await page.screenshot({ path: path.join(output, `${width}-${routeName}-gap.png`), fullPage: true });
   failing = true;
   await info.getByRole('button', { name: '목록 다시 조회' }).click();
   await info.getByText('갱신 실패 · 오래된 데이터').waitFor();
   assert.equal(await info.getByRole('button', { name: '목록 다시 조회' }).isDisabled(), true);
   await page.screenshot({ path: path.join(output, `${width}-${routeName}-stale.png`), fullPage: true });
   failing = false;
   await info.getByText('조회 복구').waitFor();
   results.push({ route: routeName, width, initial, unchanged, gap: 61, hiddenNewRequests: 0, origin, chain: 'a', at: new Date().toISOString(), size });
   await page.goto(`${origin}/?chain=a`);
  }
  await context.close();
 }
 fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ build: process.env.BROWSER_BUILD, chrome: browser.version(), results, boundaries: 'synthetic HTTP and document.visibilityState; Chrome rendering; no physical device, assistive technology, chain CORS, signing or broadcast' }, null, 2));
} finally { await browser.close(); }
