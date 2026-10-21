// Run against an isolated Next build configured with chain keys a/b and LCD https://a.example / https://b.example.
// Supply PLAYWRIGHT_MODULE (installed module path), CHROME_EXECUTABLE, BROWSER_ORIGIN and BROWSER_OUTPUT as needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.BROWSER_ORIGIN || 'http://127.0.0.1:3219';
const output = process.env.BROWSER_OUTPUT || '/tmp/gura46-browser';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const requests = [], errors = [], cases = [];
const cursor = 'a+/==&?';
const pagination = key => ({ next_key: key, total: '0' });
const channel = n => ({ port_id: 'transfer', channel_id: `channel-${n}`, state: 'STATE_OPEN' });
let ibcFail = true, addressMode = 'pages', retryPending = false, releaseRetry;
const retryReady = new Promise(resolve => { releaseRetry = resolve; });
page.on('pageerror', error => errors.push(error.message));
await context.route(/https:\/\/[ab]\.example\//, async route => {
  const url = new URL(route.request().url()); requests.push(url.href);
  const next = url.searchParams.has('pagination.key');
  let json;
  if (url.pathname.endsWith('/channels')) {
    if (url.hostname === 'b.example') json = { channels: [channel(900)], pagination: pagination(null) };
    else if (next && ibcFail) { ibcFail = false; await route.fulfill({ status: 500, body: '' }); return; }
    else json = { channels: next ? [channel(101)] : Array.from({ length: 100 }, (_, i) => channel(i + 1)), pagination: pagination(next ? null : cursor) };
  } else if (url.pathname.endsWith('/denoms_metadata')) json = { metadatas: [], pagination: pagination(null) };
  else if (url.pathname.endsWith('/params')) json = { params: { bond_denom: 'agxn', unbonding_time: '86400s' } };
  else if (url.pathname.endsWith('/validators')) {
    const validator = n => ({ operator_address: `operator-${n}`, description: { moniker: `Validator ${n}` }, tokens: '100', status: 'BOND_STATUS_BONDED' });
    json = { validators: next ? [validator(21)] : Array.from({ length: 20 }, (_, i) => validator(i + 1)), pagination: pagination(next ? null : cursor) };
  } else if (url.pathname.endsWith('/txs')) {
    const tx = (hash, height) => ({ txhash: hash, height: String(height), code: 0 });
    const sender = url.searchParams.get('query').includes('message.sender');
    if (addressMode === 'retry' && sender) {
      if (!retryPending) { await route.fulfill({ status: 500, body: '' }); return; }
      await retryReady;
    }
    const rows = addressMode === 'retry' ? sender ? [tx('SENDER', 2)] : [tx('RECIPIENT', 3)]
      : sender ? Array.from({ length: 101 }, (_, i) => tx(`S${i}`, 101 - i)) : [tx('NEWEST', 102), tx('S0', 101)];
    const pageNumber = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 100);
    json = { tx_responses: rows.slice((pageNumber - 1) * limit, pageNumber * limit), txs: [], pagination: null, total: String(rows.length) };
  } else if (url.pathname.includes('/balances/')) json = { balances: [] };
  else if (url.pathname.includes('/accounts/')) json = { account: { account_number: '1', sequence: '1' } };
  else if (url.pathname.endsWith('/proposals')) {
    const proposal = n => ({ id: String(n), title: `Proposal ${n}`, status: 'PROPOSAL_STATUS_PASSED' });
    json = { proposals: next ? [proposal(101)] : Array.from({ length: 100 }, (_, i) => proposal(i + 1)), pagination: pagination(next ? null : cursor) };
  } else { await route.fulfill({ status: 503, body: '' }); return; }
  await route.fulfill({ json });
});
try {
  await page.goto(`${origin}/operations?chain=a`);
  await page.getByText('channel-100', { exact: true }).waitFor();
  await page.getByRole('button', { name: '목록 이어보기', exact: true }).click();
  await page.getByText(/HTTP 500/).waitFor();
  assert(await page.getByText('channel-1', { exact: true }).isVisible());
  await page.getByRole('button', { name: '목록 추가 조회 재시도', exact: true }).click();
  await page.getByText('channel-101', { exact: true }).waitFor();
  await page.getByText('목록: 현재 조회 101건 · 전체 개수 미확인', { exact: true }).waitFor();
  const ibc = requests.filter(url => url.includes('/channels')).map(url => new URL(url).searchParams.get('pagination.key'));
  // Next dev StrictMode may abort and repeat the initial mount request.
  assert(ibc.length >= 3);
  assert(ibc.slice(0, -2).every(key => key === null));
  assert.deepEqual(ibc.slice(-2), [cursor, cursor]);
  cases.push('IBC 101 / total=0 / encoded cursor / error keeps rows / same cursor retry');
  await page.screenshot({ path: path.join(output, 'ibc.png') });
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Chain B fixture' }).click();
  await page.waitForURL(/chain=b/);
  await page.getByText('channel-900', { exact: true }).waitFor();
  assert.equal(await page.getByText('channel-101', { exact: true }).count(), 0);
  assert.equal(new URL(requests.at(-1)).searchParams.has('pagination.key'), false);
  cases.push('chain selection resets rows and cursor');
  await page.goto(`${origin}/staking?chain=a`);
  await page.getByText('Validator 20', { exact: true }).waitFor();
  await page.getByRole('button', { name: '목록 이어보기', exact: true }).click();
  await page.getByText('Validator 21', { exact: true }).waitFor();
  assert(await page.getByText(/비율은 현재 조회 목록 내 비중/).isVisible());
  cases.push('validators 21 / loaded-population label');
  await page.goto(`${origin}/governance?chain=a`);
  await page.getByText('Proposal 100', { exact: true }).waitFor();
  await page.getByRole('button', { name: '목록 이어보기', exact: true }).click();
  await page.getByText('Proposal 101', { exact: true }).waitFor();
  await page.getByRole('tab', { name: '가결', exact: true }).click();
  await page.getByText('Proposal 100', { exact: true }).waitFor();
  assert.equal(await page.getByText('Proposal 101', { exact: true }).count(), 0);
  cases.push('proposals 101 / filter resets pages');
  await page.goto(`${origin}/address/guru1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpk053t3?chain=a`);
  const newest = page.getByRole('link', { name: /NEWEST/ });
  await newest.waitFor();
  assert.equal(await newest.getAttribute('href'), '/tx/NEWEST?chain=a');
  assert.equal(await page.getByText('S0', { exact: true }).count(), 1);
  for (const count of [60, 90, 101]) {
    await page.getByRole('button', { name: '송신 이어보기', exact: true }).click();
    await page.getByText(`송신: 현재 조회 ${count}건 · 전체 개수 미확인`, { exact: true }).waitFor();
  }
  const txLinks = await page.locator('a[href^="/tx/"]').allTextContents();
  assert.equal(txLinks.length, 102); assert(txLinks[0].startsWith('NEWEST'));
  cases.push('SDK address sender 101 / page 1-4 / latest recipient / duplicate once / chain link');
  await page.screenshot({ path: path.join(output, 'address.png') });
  const senderPages = requests.filter(value => value.includes('/txs?') && new URL(value).searchParams.get('query').includes('message.sender')).map(value => new URL(value).searchParams.get('page'));
  assert.deepEqual(senderPages.slice(-3), ['2', '3', '4']);
  addressMode = 'retry';
  await page.reload();
  await page.getByText('RECIPIENT', { exact: true }).waitFor();
  await page.getByRole('region', { name: '송신 거래' }).getByText(/HTTP 500/).waitFor();
  retryPending = true;
  await page.getByRole('region', { name: '송신 거래' }).getByRole('button', { name: '다시 조회', exact: true }).click();
  await page.getByRole('region', { name: '송신 거래' }).getByText('불러오는 중', { exact: true }).waitFor();
  assert(await page.getByText('RECIPIENT', { exact: true }).isVisible());
  assert(await page.getByText(/송수신 일부 범위만/).isVisible());
  await page.screenshot({ path: path.join(output, 'address-delayed-retry.png') });
  releaseRetry();
  await page.getByText('SENDER', { exact: true }).waitFor();
  assert(await page.getByText('RECIPIENT', { exact: true }).isVisible());
  assert.equal(await page.getByText(/송수신 일부 범위만/).count(), 0);
  cases.push('sender initial failure / delayed retry keeps recipient and partial notice / success');
  assert.deepEqual(errors, []);
  const result = { passed: true, origin, build: process.env.BROWSER_BUILD || 'isolated Next build / unchanged product sources', chain: ['a', 'b'], fixture: 'HTTP intercepted at browser boundary; no live signing', at: new Date().toISOString(), cases, requestCount: requests.length, errors };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
