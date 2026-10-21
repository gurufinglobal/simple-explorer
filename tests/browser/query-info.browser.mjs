// GURA-52: real Next routes and Chrome; only the HTTP boundary is synthetic.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.BROWSER_ORIGIN ?? 'http://127.0.0.1:3257';
const output = process.env.BROWSER_OUTPUT ?? '/private/tmp/gura52-evidence/browser';
const before = process.env.BROWSER_BEFORE === '1';
fs.mkdirSync(output, { recursive: true });
const address = 'guru1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpk053t3';
const proposal = { id: '12', title: 'CP5 proposal fixture', summary: 'Proposal body stays visible', status: 'PROPOSAL_STATUS_PASSED', submit_time: '2026-10-01T00:00:00Z', deposit_end_time: '2026-10-02T00:00:00Z', voting_start_time: '2026-10-02T00:00:00Z', voting_end_time: '2026-10-03T00:00:00Z', total_deposit: [], final_tally_result: { yes_count: '5', no_count: '0', abstain_count: '0', no_with_veto_count: '0' } };
const row = { id: '12', fee: '0.006', limit: '999999999999', nonce: '0' };
function body(path) {
 if (path.endsWith('/params/voting')) return { voting_params: { voting_period: '100s' } };
 if (path.endsWith('/params/tallying')) return { tally_params: { quorum: '0.3', threshold: '0.5', veto_threshold: '0.33' } };
 if (path.endsWith('/params/deposit')) return { deposit_params: { min_deposit: [{ denom: 'agxn', amount: '1' }], max_deposit_period: '100s' } };
 if (path.endsWith('/proposals/12')) return { proposal };
 if (path.endsWith('/tally')) return { tally: proposal.final_tally_result };
 if (path.endsWith('/votes')) return { votes: [], pagination: { next_key: null } };
 if (path.endsWith('/deposits')) return { deposits: [] };
 if (path.endsWith('/exchanges')) return { exchanges: [row] };
 if (path.endsWith('_fees')) return { coins: [] };
 if (path.endsWith('/requests')) return { requests: [row] };
 if (path.endsWith('/requests/12')) return { request: row };
 if (path.endsWith('/result')) return { result: { request_id: '12', nonce: '0', aggregated_time: '123' } };
 if (path.endsWith('/reports')) return { reports: [{ request_id: '12', nonce: '0', provider: address, raw_data: 'raw', signature: 'unverified' }] };
 if (path.endsWith('/results')) return { results: [] };
 if (path.endsWith('/categories')) return { categories: [] };
 if (path.endsWith('/whitelist')) return { addresses: [], count: '0' };
 if (path.endsWith('/moderator_address')) return { moderator_address: address };
 if (path.endsWith('/discounts')) return { discounts: [{ address: '', modules: [{ module: 'bank', discounts: [{ discount_type: 'percent', amount: '100' }] }] }] };
 if (path.endsWith('/denoms_metadata')) return { metadatas: [{ base: 'agxn', display: 'gxn', symbol: 'GXN', denom_units: [{ denom: 'agxn', exponent: 0 }, { denom: 'gxn', exponent: 6 }] }] };
 if (path.includes('/balances/')) return { balances: [{ denom: 'agxn', amount: '10' }] };
 if (path.includes('/accounts/')) return { account: { account_number: '1', sequence: '2' } };
 if (path.includes('/unbonding_delegations/') || path.endsWith('/unbonding_delegations')) return { unbonding_responses: [] };
 if (path.includes('/delegations/')) return { delegation_responses: [] };
 if (path.endsWith('/rewards')) return { total: [] };
 if (path.endsWith('/txs')) return { tx_responses: [], txs: [], pagination: null, total: '0' };
 if (path.endsWith('/params')) return { params: { bond_denom: 'agxn', unbonding_time: '100s', enabled: true } };
 if (path.endsWith('/constant_fee')) return { constant_fee: { denom: 'agxn', amount: '1' } };
 throw new Error(`Unmatched fixture ${path}`);
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const observations = [], requests = [], errors = [];
const result = { origin, before, sourceSha: process.env.SOURCE_SHA ?? 'working-tree', browser: browser.version(), syntheticHttp: true, observedAt: new Date().toISOString(), observations, requests, errors };
try {
 for (const width of [360, 768, 1280]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  let mode = 'normal', released;
  await context.route(/https:\/\/(on|off)\.example\//, async route => {
   const url = new URL(route.request().url());
   const path = url.pathname.replace(/^\/long-source-[^/]+/, '');
   requests.push({ mode, path, width, host: url.hostname });
   assert.equal(route.request().method(), 'GET');
   if (mode === 'busy' && path.endsWith('/tally')) await new Promise(resolve => { released = resolve; });
   if (mode === 'retry' && path.endsWith('/tally')) return route.fulfill({ status: 429, headers: { 'retry-after': '2', 'access-control-expose-headers': 'retry-after' }, json: {} });
   if (mode === 'partial' && path.endsWith('/crisis/v1beta1/constant_fee')) return route.fulfill({ status: 501, json: {} });
   if (mode === 'unsupported' && path.endsWith('/crisis/v1beta1/constant_fee')) return route.fulfill({ status: 501, json: {} });
   await route.fulfill({ json: body(path), headers: { 'x-cosmos-block-height': '123', 'access-control-expose-headers': 'x-cosmos-block-height' } });
  });
  const capture = async name => {
   const metrics = await page.evaluate(() => ({ queryArea: (() => { const info = document.querySelector('section[aria-label*="조회 정보"]'); if (info) return info.getBoundingClientRect().height; const rows = [...document.querySelectorAll('[data-query-status]')]; if (!rows.length) return null; return location.pathname.startsWith('/governance/') ? rows[5].getBoundingClientRect().bottom - rows[0].getBoundingClientRect().top : rows[0].parentElement.getBoundingClientRect().height; })(), overflow: document.documentElement.scrollWidth - innerWidth, info: [...document.querySelectorAll('section')].filter(el => el.getAttribute('aria-label')?.includes('조회 정보')).map(el => ({ label: el.getAttribute('aria-label'), y: el.getBoundingClientRect().y, height: el.getBoundingClientRect().height })), firstCard: document.querySelector('.MuiCard-root')?.getBoundingClientRect().y }));
   if (!before) assert(metrics.overflow <= 1, `${width} ${name}: overflow ${metrics.overflow}`);
   observations.push({ width, name, mode, ...metrics, observedAt: new Date().toISOString() });
   await page.screenshot({ path: `${output}/${width}-${name}.png`, fullPage: true });
  };
  await page.goto(origin + '/governance/12?chain=on');
  await page.getByText('CP5 proposal fixture', { exact: false }).first().waitFor();
  await page.getByText('조회 완료: 빈 결과', { exact: true }).first().waitFor();
  await capture('governance-closed');
  if (!before) {
   if (width === 1280) assert(observations.at(-1).firstCard < 900, 'proposal card must be in first viewport');
   const toggle = page.getByRole('button', { name: '조회 정보', exact: true });
   assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
   await toggle.focus(); await page.keyboard.press('Enter');
   assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
   assert(await page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`).isVisible());
   await page.getByText(/대상: proposal:12/).waitFor();
   assert(await page.getByText(/출처: https:\/\/on.example/).count() >= 8);
   await capture('governance-expanded-long-url');
   await page.keyboard.press('Space'); assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
   await page.keyboard.press('Tab'); assert(await page.evaluate(() => document.activeElement?.tagName === 'BUTTON'));
   await page.getByRole('tab', { name: 'Raw JSON' }).click();
   await toggle.click(); await toggle.click();
   assert.equal(await page.getByRole('tab', { name: 'Raw JSON' }).getAttribute('aria-selected'), 'true');
   mode = 'retry';
   await page.getByRole('button', { name: '집계 다시 조회', exact: true }).click();
   await page.getByText('갱신 실패: 마지막 조회 데이터', { exact: true }).waitFor();
   const retry = page.getByRole('button', { name: '집계 다시 조회', exact: true });
   assert(await retry.isDisabled());
   const count = requests.filter(r => r.width === width && r.mode === 'retry').length;
   await capture('governance-stale-retry');
   await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '집계 다시 조회')?.disabled);
   assert.equal(requests.filter(r => r.width === width && r.mode === 'retry').length, count, 'no automatic duplicate request');
   mode = 'busy'; await retry.click();
   await page.getByText('불러오는 중', { exact: true }).first().waitFor(); assert(await retry.isDisabled());
   await capture('governance-busy');
   mode = 'normal'; released();
   await page.getByText('4/6개 조회 완료', { exact: true }).waitFor();
   assert.equal(await page.getByRole('tab', { name: 'Raw JSON' }).getAttribute('aria-selected'), 'true');
   await page.getByRole('tab', { name: '투표 내역' }).click();
   await page.getByText('투표: 현재 조회 0건 · 전체 개수 미확인', { exact: true }).waitFor();
  }
  for (const state of ['normal', 'partial']) {
   mode = state; await page.goto(origin + '/params?chain=on');
   await page.getByText('Auth Params', { exact: true }).waitFor();
   if (state === 'partial') await page.getByText('일부 조회 실패', { exact: true }).waitFor();
   else if (!before) await page.getByText('1/1개 조회 완료', { exact: true }).waitFor();
   await capture(`params-${state}-closed`);
   if (!before) {
    if (state === 'partial') await page.getByText('Crisis Constant Fee: HTTP 501', { exact: true }).waitFor();
    await page.getByRole('button', { name: '조회 정보', exact: true }).click();
    assert(await page.getByText(/출처: https:\/\/on.example/).count() >= 14);
    await capture(`params-${state}-expanded`);
   }
  }
  if (!before) for (const path of ['/oracle', '/oracle/12', '/bex', '/bex/12', '/feepolicy', '/feepolicy/ALL', '/tokens', '/address/'+address]) {
   mode = 'normal'; await page.goto(origin + path + '?chain=on');
   await page.waitForFunction(() => document.querySelector('section[aria-label*="조회 정보"]') && !document.querySelector('[data-query-status="loading"]'));
   await capture(path.replaceAll('/','-')+'-closed');
   for (const toggle of await page.getByRole('button', { name: '조회 정보', exact: true }).all()) await toggle.click();
   await capture(path.replaceAll('/','-')+'-expanded');
  }
  if (!before) {
   mode = 'normal'; await page.goto(origin + '/params?chain=off');
   await page.getByText('Oracle Params: unsupported', { exact: true }).waitFor();
   await capture('params-unsupported-closed');
   assert(requests.every(r => r.host !== 'off.example' || !/^\/guru\/(oracle|bex|feepolicy)\//.test(r.path)));
  }
  await context.close();
 }
 assert.deepEqual(errors, []);
} finally {
 fs.writeFileSync(`${output}/result.json`, JSON.stringify(result, null, 2));
 await browser.close();
}
