// W12 real Chrome/Next routing with synthetic HTTP only. No wallets or broadcasts.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.BROWSER_ORIGIN ?? 'http://127.0.0.1:3250';
const output = process.env.BROWSER_OUTPUT ?? '/private/tmp/gura50-evidence/browser';
fs.mkdirSync(output, { recursive: true });
const row = { id: '9007199254740993', denom_a: 'a'.repeat(80), denom_b: 'b'.repeat(80), fee: '0.006000000000000000', limit: '999999999999999999999999999', nonce: '9007199254740993', symbol: 'RAW', status: 'UNKNOWN' };
const discount = { address: '', modules: [{ module: 'bank', discounts: [{ discount_type: 'percent', msg_type: '/cosmos.bank.v1beta1.MsgSend', amount: '100.000000000000000000' }, { discount_type: 'percentage', msg_type: '/synthetic.Message', amount: '0.000000000000000001' }] }] };
function response(path) {
 if (path.endsWith('/exchanges')) return { exchanges: [row] };
 if (path.endsWith('_fees')) return { coins: [{ denom: 'agxn', amount: '999999999999999999999999999' }] };
 if (path.endsWith('/requests')) return { requests: [row] };
 if (/\/requests\/\d+$/.test(path)) return { request: row };
 if (path.endsWith('/result')) return { result: { request_id: row.id, nonce: '0', aggregated_time: '99999999999999999999', aggregated_data: '9007199254740993' } };
 if (path.endsWith('/reports')) return { reports: [{ request_id: row.id, nonce: '0', provider: 'provider'.repeat(20), raw_data: '99999999999999999999', signature: 'unverified'.repeat(30) }] };
 if (path.endsWith('/results')) return { results: [{ request_id: row.id, nonce: row.nonce, aggregated_data: '99999999999999999999', aggregated_height: '9007199254740993', aggregated_time: '99999999999999999999' }] };
 if (path.endsWith('/params')) return { params: { enable: true, quorum_ratio: '0.666666666666666667' } };
 if (path.endsWith('/categories')) return { categories: [] };
 if (path.endsWith('/whitelist')) return { addresses: [], count: '0' };
 if (path.endsWith('/moderator_address')) return { moderator_address: 'moderator'.repeat(15) };
 if (path.endsWith('/discounts')) return { discounts: [discount] };
 throw new Error(path);
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const observations = [], errors = [], requests = [];
const result = { origin, observedAt: new Date().toISOString(), browser: browser.version(), sourceSha: process.env.SOURCE_SHA ?? 'working-tree', fixture: true, observations, errors, requests, actualMobile: false, screenReader: false, signer: 'not invoked' };
try {
 for (const width of [360, 768, 1280]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  let mode = 'normal';
  await context.route(/https:\/\/(on|off)\.example\//, async route => {
   const url = new URL(route.request().url()); requests.push({ url: url.href, method: route.request().method(), width, mode });
   assert.equal(route.request().method(), 'GET'); assert.equal(url.hostname, 'on.example');
   const data = response(url.pathname);
   if (mode === '404') return route.fulfill({ status: 404, json: {} });
   if (mode === '500') return route.fulfill({ status: 500, json: {} });
   if (mode === 'timeout') { await new Promise(r => setTimeout(r, 10500)); return route.fulfill({ json: data }).catch(() => {}); }
   if (mode === 'empty') for (const key of ['exchanges','requests','discounts']) if (data[key]) data[key] = [];
   if (mode === 'malformed') for (const key of ['exchanges','requests','discounts']) if (data[key]) data[key] = 'bad';
   if (mode === 'partial') for (const key of ['exchanges','requests','discounts']) if (data[key]) data[key].push(null);
   await route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*', 'x-cosmos-block-height': '123', 'access-control-expose-headers': 'x-cosmos-block-height' } });
  });
  const capture = async name => {
   const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth - innerWidth, body: document.body.scrollWidth - innerWidth }));
   assert(overflow.document <= 1, `${width} ${name} document overflow ${overflow.document}`);
   observations.push({ width, name, url: page.url(), mode, overflow, observedAt: new Date().toISOString() });
   await page.screenshot({ path: `${output}/${width}-${name}.png`, fullPage: true });
  };
  const checkTables = async name => {
   const regions = page.getByRole('region', { name: '모듈 표 가로 스크롤' });
   assert(await regions.count() > 0, `${name}: missing table region`);
   for (const [index, region] of (await regions.all()).entries()) {
    const metrics = await region.evaluate(el => {
     el.scrollLeft = 0;
     const cells = [...el.querySelectorAll('th, td')].map(cell => {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      const tops = new Set();
      while (walker.nextNode()) {
       if (!walker.currentNode.textContent.trim()) continue;
       const range = document.createRange(); range.selectNodeContents(walker.currentNode);
       for (const rect of range.getClientRects()) tops.add(Math.round(rect.top));
      }
      return { text: cell.textContent, width: cell.getBoundingClientRect().width, lines: tops.size, header: cell.tagName === 'TH', wraps: getComputedStyle(cell).whiteSpace !== 'nowrap' };
     });
     return { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, cells };
    });
    observations.push({ width, name, table: metrics });
    for (const cell of metrics.cells) {
     if (cell.header || !cell.wraps || /^[0-9.]+$/.test(cell.text) || cell.text === 'UNKNOWN') assert(cell.lines <= 1, `${name}: wrapped raw value/header ${JSON.stringify(cell)}`);
     else assert(cell.width >= 240, `${name}: compressed text column ${JSON.stringify(cell)}`);
    }
    // The fixture deliberately contains wide tables. A scroll container alone
    // does not prove that content can actually move inside it.
    if (width === 360) assert(metrics.scrollWidth > metrics.clientWidth, `${name}: no internal overflow`);
    await region.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    assert(await region.evaluate(el => el === document.activeElement), `${name}: region not reachable with Tab`);
    if (metrics.scrollWidth > metrics.clientWidth) {
     await page.keyboard.press('ArrowRight');
     await page.waitForFunction(el => el.scrollLeft > 0, await region.elementHandle());
     const end = await region.evaluate(el => {
      const keyboardScrollLeft = el.scrollLeft;
      el.scrollLeft = el.scrollWidth;
      const last = el.querySelector('tbody tr:last-child td:last-child').getBoundingClientRect();
      const viewport = el.getBoundingClientRect();
      return { keyboardScrollLeft, scrollLeft: el.scrollLeft, lastColumnVisible: last.right <= viewport.right + 1 && last.right > viewport.left };
     });
     observations.push({ width, name, scroll: end });
     assert(end.scrollLeft > 0 && end.lastColumnVisible, `${name}: last column unreachable`);
     await page.screenshot({ path: `${output}/${width}-${name}-scroll-end-${index}.png`, fullPage: true });
     await region.evaluate(el => { el.scrollLeft = 0; });
    }
   }
  };
  const routes = ['/bex', `/bex/${row.id}`, '/oracle', `/oracle/${row.id}`, '/feepolicy', '/feepolicy/ALL'];
  for (const path of routes) {
   await page.goto(origin + path + '?chain=off');
   await page.getByRole('alert').filter({ hasText: '지원 설정' }).first().waitFor();
   if (width < 900) await page.getByRole('button', { name: '탐색 메뉴 열기' }).click();
   for (const name of ['BEX','Oracle','FeePolicy']) assert.equal(await page.getByRole('navigation').getByRole('link', { name, exact: true }).count(), 0);
   if (width < 900) await page.keyboard.press('Escape');
   await capture(path.replaceAll('/', '-') + '-off');
  }
  for (const path of routes) {
   mode = 'normal'; await page.goto(origin + path + '?chain=on');
   await page.getByText(/응답 높이: 123/).first().waitFor();
   if (width < 900) await page.getByRole('button', { name: '탐색 메뉴 열기' }).click();
   for (const name of ['BEX','Oracle','FeePolicy']) assert.equal(await page.getByRole('navigation').getByRole('link', { name, exact: true }).count(), 1);
   if (width < 900) await page.keyboard.press('Escape');
   if (path === '/oracle/' + row.id) { await page.getByRole('tab', { name: 'Reports', exact: true }).click(); await page.getByText('unverified'.repeat(30), { exact: true }).waitFor(); }
   await capture(path.replaceAll('/', '-') + '-normal');
   await checkTables(path.replaceAll('/', '-') + '-normal');
   if (path === '/oracle/' + row.id) {
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await capture('oracle-history-normal'); await checkTables('oracle-history-normal');
   }
  }
  for (const path of ['/bex','/oracle','/feepolicy']) {
   for (const nextMode of ['404','500','empty','malformed','partial']) {
    mode = nextMode; await page.goto(origin + path + '?chain=on');
    await page.getByText(nextMode === 'empty' ? '조회 완료: 빈 결과' : nextMode === 'partial' ? '일부 조회 실패' : '조회 실패', { exact: true }).first().waitFor();
    await capture(path.slice(1) + '-' + nextMode);
    if (['404','500'].includes(nextMode)) {
     mode = 'normal'; await page.getByRole('button', { name: '다시 조회', exact: true }).first().click();
     await page.locator('main').getByRole('link', { name: path === '/feepolicy' ? 'ALL' : row.id, exact: true }).waitFor();
    }
   }
  }
  for (const path of ['/bex', '/oracle', '/feepolicy']) {
  mode = 'normal'; await page.goto(origin + path + '?chain=on');
  const id = path === '/feepolicy' ? 'ALL' : row.id;
  const link = page.locator('main').getByRole('link', { name: id, exact: true }); await link.waitFor();
  await page.getByRole('region', { name: '모듈 표 가로 스크롤' }).focus(); await page.keyboard.press('Tab');
  assert.equal(await link.evaluate(el => el === document.activeElement), true); await page.keyboard.press('Enter');
  await page.waitForURL('**' + path + '/' + id + '?chain=on'); await capture(path.slice(1) + '-keyboard-detail');
  }
  if (width === 360) {
   mode = 'timeout'; await page.goto(origin + '/bex?chain=on');
   await page.getByRole('alert').filter({ hasText: 'timeout' }).waitFor({ timeout: 15000 }); await capture('bex-timeout');
   mode = 'normal'; await page.getByRole('button', { name: '다시 조회', exact: true }).click(); await page.locator('main').getByRole('link', { name: row.id, exact: true }).waitFor();
  }
  await context.close();
 }
 assert.equal(errors.length, 0);
} finally {
 fs.writeFileSync(`${output}/results.json`, JSON.stringify(result, null, 2));
 await browser.close();
}
console.log(JSON.stringify({ observations: observations.length, errors: errors.length, requests: requests.length }));
