// W08: real routes/components; only HTTP and injected wallet boundaries are synthetic.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { account, pubkey, hash, validator, response } from './i18n-fixture.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.BROWSER_ORIGIN || 'http://127.0.0.1:3265';
const output = process.env.BROWSER_OUTPUT || '/private/tmp/gura66-browser';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const cases = [], errors = [], requests = [];
const result = { sourceSha: process.env.SOURCE_SHA || 'working-tree', browser: browser.version(), origin, observedAt: new Date().toISOString(), syntheticHttpAndWallet: true, cases, errors, requests };
try {
for (const width of [360, 768, 1440]) for (const locale of ['en', 'ko']) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: locale === 'ko' ? 'ko-KR' : 'en-US' });
  let mode = 'normal', release;
  await context.route('https://i18n.example/**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const rpcMethod = method === 'POST' ? route.request().postDataJSON().method : null;
    requests.push({ width, locale, mode, path: url.pathname, method, rpcMethod });
    // Connecting the wallet also verifies the read-only JSON-RPC status endpoint.
    assert(method === 'GET' || method === 'POST' && url.pathname === '/rpc' && rpcMethod === 'status', 'Only public reads and the connection status probe are allowed');
    if (url.pathname.endsWith('/blocks/10')) {
      if (mode === 'busy') await new Promise(resolve => { release = resolve; });
      if (mode === 'error' || mode === 'stale') return route.fulfill({ status: 429, headers: { 'retry-after': '2', 'access-control-expose-headers': 'retry-after' }, json: {} });
    }
    if (mode === 'partial' && url.pathname.endsWith('/constant_fee')) return route.fulfill({ status: 503, json: {} });
    await route.fulfill({ json: response(url), headers: { 'x-cosmos-block-height': '10', 'access-control-expose-headers': 'x-cosmos-block-height' } });
  });
  await context.addInitScript(({ account, pubkey }) => {
    window.__signs = 0; window.__submits = 0;
    document.addEventListener('submit', () => window.__submits++);
    window.keplr = { enable: async () => {} };
    window.getOfflineSigner = () => ({ getAccounts: async () => [{ address: account, pubkey: new Uint8Array(pubkey), algo: 'secp256k1' }], signDirect: async () => { window.__signs++; throw new Error('Unexpected signature'); } });
  }, { account, pubkey });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error' && /hydrati|MISSING_MESSAGE|INVALID_MESSAGE|React error/i.test(msg.text())) errors.push(msg.text()); });
  const retry = () => page.getByRole('button').filter({ hasText: /Retry query|Retry in \d+ seconds|다시 조회|\d+초 후 재시도/ });
  const capture = async name => {
    await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished)));
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      buttons: [...document.querySelectorAll('button')].filter(el => /Retry query|Retry in \d+ seconds|다시 조회|\d+초 후 재시도/.test(el.textContent)).map(el => {
        const rect = el.getBoundingClientRect(), row = el.closest('[data-query-status]'), header = row?.firstElementChild;
        const alert = row?.querySelector('[role="alert"]');
        return { label: el.getAttribute('aria-label'), text: el.textContent, width: rect.width, height: rect.height, x: rect.x, right: rect.right, parentWidth: el.parentElement.getBoundingClientRect().width, type: el.type, disabled: el.disabled, inHeader: !row || header.contains(el), beforeError: !alert || rect.bottom <= alert.getBoundingClientRect().top + 1, clipped: el.scrollWidth > el.clientWidth + 1 };
      }),
      signs: window.__signs, submits: window.__submits,
    }));
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert(metrics.overflow <= 1, `${name} ${locale} ${width} document overflow: ${metrics.overflow}`);
    assert(metrics.buttons.length, `${name}: no refresh button`);
    for (const button of metrics.buttons) {
      assert(button.width <= button.parentWidth + 1 && button.right <= width + 1 && button.x >= 0, `${name}: button exceeds available space ${JSON.stringify(button)}`);
      assert(button.height >= 44 && !button.clipped, `${name}: touch area or clipped text`);
      assert(button.inHeader && button.beforeError, `${name}: refresh outside header`);
      assert.equal(button.type, 'button');
      if (!button.label) assert(button.width < button.parentWidth - 8, `${name}: stretched single-query button`);
    }
    assert.equal(metrics.signs, 0); assert.equal(metrics.submits, 0);
    cases.push({ name, locale, width, mode, ...metrics });
    await page.screenshot({ path: `${output}/${locale}-${width}-${name}.png`, fullPage: true });
    console.log(`${locale} ${width} ${name}: passed`);
  };
  const goto = async path => {
    await page.goto(origin + path + '?chain=fixture');
    await retry().first().waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-query-status="loading"]') && !document.querySelector('[data-query-status="idle"] button:disabled'));
  };
  mode = 'error'; await goto('/blocks/10');
  await page.locator('[data-query-status="error"]').waitFor();
  assert(await retry().first().isDisabled()); await capture('block-error-retry-after');
  await page.waitForFunction(() => !document.querySelector('[data-query-status] button').disabled);
  mode = 'busy'; await retry().first().focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  assert(await retry().first().evaluate(el => document.activeElement === el && el.classList.contains('Mui-focusVisible')));
  await capture('block-keyboard-focus');
  const count = requests.length;
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-query-status] button').disabled);
  await capture('block-loading');
  await retry().first().evaluate(el => { el.click(); el.click(); });
  assert.equal(requests.length - count, 1, 'Busy must prevent duplicate reads');
  assert(requests.at(-1).path.endsWith('/blocks/10'));
  mode = 'normal'; release();
  await page.locator('[data-query-status="success"]').waitFor(); await capture('block-success');
  const observed = await page.locator('[data-query-status] time').allTextContents();
  mode = 'stale'; await retry().first().click();
  await page.locator('[data-query-status="stale"]').waitFor(); await capture('block-stale');
  assert.deepEqual(await page.locator('[data-query-status] time').allTextContents(), observed);
  mode = 'normal';
  for (const [name, path] of [
    ['transaction', '/tx/'+hash], ['staking', '/staking'], ['validator', '/staking/'+validator], ['operations', '/operations'],
    ['address', '/address/'+account], ['oracle', '/oracle/1'], ['params', '/params'], ['dashboard', '/dashboard'], ['proposal-form', '/governance/new'],
  ]) { await goto(path); await capture(name); }
  mode = 'partial'; await goto('/params');
  await page.locator('[data-query-status="partial"]').waitFor(); await capture('params-partial');
  await page.getByRole('button', { name: locale === 'ko' ? '조회 정보' : 'Query information', exact: true }).click();
  await capture('params-expanded-partial');
  mode = 'normal'; await goto('/governance/1');
  await page.getByText('원문 Proposal title', { exact: true }).waitFor();
  const tally = page.getByRole('button', { name: locale === 'ko' ? '집계 다시 조회' : 'Retry Tally', exact: true });
  const before = requests.length; await tally.click();
  await page.waitForFunction(() => !document.querySelector('[data-query-status="loading"]'));
  assert.equal(requests.length - before, 1); assert(requests.at(-1).path.endsWith('/tally'));
  await capture('governance-query-isolation');
  await page.goto(origin+'/wallet?chain=fixture');
  await page.getByRole('button', { name: locale === 'ko' ? 'Keplr 연결' : 'Connect Keplr', exact: true }).click();
  await page.getByText('9007199254740993123.456789 GXN', { exact: true }).first().waitFor();
  await capture('wallet-assets-long-label');
  await page.getByRole('tab', { name: locale === 'ko' ? '전송' : 'Send', exact: true }).click();
  const amountQuery = page.locator('[data-query-status]').filter({ hasText: 'amount-metadata' });
  await amountQuery.locator('button').waitFor();
  const beforeAmount = requests.length;
  await amountQuery.locator('button').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-query-status]')].find(el => el.textContent.includes('amount-metadata'))?.getAttribute('data-query-status') === 'success');
  assert.equal(requests.length - beforeAmount, 1); assert(requests.at(-1).path.endsWith('/denoms_metadata'));
  assert.equal(await page.getByRole('dialog').count(), 0);
  await capture('wallet-send-query-only');
  await context.close();
}
assert.deepEqual(errors, []);
} finally {
  fs.writeFileSync(`${output}/result.json`, JSON.stringify(result, null, 2));
  await browser.close();
}
