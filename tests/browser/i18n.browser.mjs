// Production browser, real locale Server Action and React UI; HTTP and wallet boundaries are synthetic.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { origin, account, validator, pubkey, hash, amount, rawTitle, rawBody, response } from './i18n-fixture.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.BROWSER_OUTPUT || '/tmp/gura61-evidence/browser';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const cases = [], errors = [], requests = [];
let signs = 0, broadcasts = 0;
const routes = [
  ['home', '/'], ['dashboard', '/dashboard'], ['blocks', '/blocks'], ['block', '/blocks/10'],
  ['transactions', '/transactions'], ['transaction', `/tx/${hash}`], ['address', `/address/${account}`],
  ['staking', '/staking'], ['validator', `/staking/${validator}`], ['governance', '/governance'],
  ['proposal', '/governance/1'], ['new-proposal', '/governance/new'], ['tokens', '/tokens'],
  ['params', '/params'], ['ibc', '/operations'], ['bex', '/bex'], ['bex-detail', '/bex/1'],
  ['oracle', '/oracle'], ['oracle-detail', '/oracle/1'], ['feepolicy', '/feepolicy'], ['feepolicy-detail', '/feepolicy/ALL'],
];
async function attach(context) {
  await context.route('https://i18n.example/**', async route => {
    const request = route.request(); requests.push(request.url());
    if (/broadcast/.test(request.url()+request.postData())) { broadcasts++; throw new Error('Unexpected broadcast'); }
    await route.fulfill({ json: response(new URL(request.url())), headers: { 'x-cosmos-block-height': '10' } });
  });
  await context.addInitScript(({ account, pubkey }) => {
    window.__walletSigns = 0;
    window.keplr = { enable: async () => {} };
    window.getOfflineSigner = () => ({ getAccounts: async () => [{ address: account, pubkey: new Uint8Array(pubkey), algo: 'secp256k1' }], signDirect: async () => { window.__walletSigns++; throw new Error('Must never sign'); } });
  }, { account, pubkey });
}
function observe(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error' && /hydrati|MISSING_MESSAGE|INVALID_MESSAGE|React error/i.test(msg.text())) errors.push(msg.text()); });
}
async function measure(page, name, width, locale) {
  await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished)));
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  const content = await page.locator('body').innerText();
  if (locale === 'en') {
    const ui = content.replaceAll(rawTitle, '').replaceAll(rawBody, '').replaceAll('한국어', '');
    if (/[가-힣]/.test(ui)) errors.push(`${name}: untranslated Korean: ${ui.split('\n').filter(line => /[가-힣]/.test(line)).join(' / ')}`);
  }
  assert.equal(await page.locator('html').getAttribute('lang'), locale);
  assert(dimensions.scroll <= dimensions.client, `${name} ${locale} ${width}: horizontal document overflow ${dimensions.scroll}`);
  if (name.includes('confirmation')) {
    for (const button of await page.getByRole('dialog').getByRole('button').all()) {
      const box = await button.boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900, 'Confirmation button must be visible in the viewport');
    }
  }
  await page.screenshot({ path: path.join(output, `${locale}-${width}-${name}.png`), fullPage: !name.includes("confirmation") });
  cases.push({ name, width, locale, ...dimensions, url: page.url() });
}
async function language(page, locale) {
  const selector = page.getByRole('combobox', { name: /^(Language|언어)$/ });
  await selector.focus(); await page.keyboard.press('ArrowDown');
  await page.getByRole('listbox').waitFor();
  await page.keyboard.press(locale === 'en' ? 'Home' : 'End'); await page.keyboard.press('Enter');
  await page.waitForFunction(locale => document.documentElement.lang === locale, locale);
  await page.waitForLoadState('networkidle');
}
try {
  // Read server-rendered HTML independently of the browser's DOM and JavaScript.
  const api = await browser.newContext();
  for (const [cookie, header, expected] of [[null, 'ko-KR, en;q=0.5', 'ko'], [null, 'fr', 'en'], ['en', 'ko-KR', 'en'], ['bad', 'ko;q=0,en;q=0.5', 'en']]) {
    const res = await api.request.get(origin+'/', { headers: { 'Accept-Language': header, ...(cookie ? { Cookie: `explorer-locale=${cookie}` } : {}) } });
    assert.equal(res.status(), 200);
    const html = await res.text(); assert(html.includes(`lang="${expected}"`));
    assert(html.includes(expected === 'en' ? 'A web dashboard for wallet connections' : '지갑 연동과 체인 탐색'));
    cases.push({ name: 'SSR locale negotiation', cookie, header, expected });
  }
  await api.close();
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width, height: 900 } });
    await attach(context); const page = await context.newPage(); observe(page);
    for (const locale of ['en', 'ko']) {
      for (const [name, route] of routes) {
        await page.goto(`${origin}${route}?chain=fixture`, { waitUntil: 'networkidle' });
        if (name === 'home' && locale === 'ko') await language(page, 'ko');
        if (name === 'address') assert((await page.locator('body').innerText()).includes(account));
        if (name === 'transaction') { assert((await page.locator('body').innerText()).includes(hash)); assert((await page.locator('body').innerText()).includes(rawBody)); }
        if (name === 'proposal') { assert((await page.locator('body').innerText()).includes(rawTitle)); assert((await page.locator('body').innerText()).includes(rawBody)); }
        await measure(page, name, width, locale);
      }
      // Actual wallet connection and preflight; cancel the confirmation before any signing call.
      await page.goto(`${origin}/dashboard?chain=fixture`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: locale === 'en' ? 'Wallet menu' : '지갑 메뉴', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Keplr', exact: true }).click();
      await page.waitForFunction(text => document.body.innerText.includes(text), locale === 'en' ? 'Transactions enabled' : '쓰기 가능');
      await page.getByRole('button', { name: locale === 'en' ? 'Send' : '송금', exact: true }).click();
      await page.getByRole('textbox', { name: locale === 'en' ? 'Recipient address' : '수신 주소', exact: true }).fill(account);
      await page.getByRole('textbox', { name: locale === 'en' ? 'Amount (display units)' : '수량 (표시 단위)', exact: true }).fill('1.234567');
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: locale === 'en' ? 'Send transaction' : '송금 실행', exact: true }).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      assert((await dialog.innerText()).includes('1234567 agxn'));
      assert((await dialog.innerText()).includes(account));
      await measure(page, 'send-confirmation', width, locale);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
      signs += await page.evaluate(() => window.__walletSigns);
      // Read the same address again after a refresh and preserve raw amounts in the DOM.
      await page.goto(`${origin}/address/${account}?chain=second&keep=1#anchor`, { waitUntil: 'networkidle' });
      const before = page.url();
      await language(page, locale === 'en' ? 'ko' : 'en');
      assert.equal(page.url(), before); await page.reload({ waitUntil: 'networkidle' }); assert.equal(page.url(), before);
      assert((await page.locator('body').textContent()).includes(amount));
      const cookies = await context.cookies();
      assert.equal(cookies.find(c => c.name === 'gf_chain')?.value, 'second');
      assert.equal(cookies.find(c => c.name === 'explorer-locale')?.value, locale === 'en' ? 'ko' : 'en');
      cases.push({ name: 'language refresh retains path/query/hash/chain/raw amount', width, from: locale, to: locale === 'en' ? 'ko' : 'en' });
      // Reset to the loop locale; next iteration explicitly switches to Korean.
      await language(page, locale);
    }
    await context.close();
  }
  assert.deepEqual(errors, []); assert.equal(signs, 0); assert.equal(broadcasts, 0);
} finally {
  fs.writeFileSync(path.join(output, 'observations.json'), JSON.stringify({ browser: browser.version(), environment: 'Production desktop Chrome viewport; synthetic HTTP/Keplr; no real signatures or broadcasts', source: process.env.SOURCE_SHA, cases, errors, signs, broadcasts, requests: requests.length }, null, 2));
  await browser.close();
}
console.log(`Passed ${cases.length} observations; ${signs} signatures; ${broadcasts} broadcasts.`);
