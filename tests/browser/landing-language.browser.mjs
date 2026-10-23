// Real production UI and locale Server Action. Public HTTP responses are synthetic; no wallet is connected.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { origin, response } from './i18n-fixture.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.BROWSER_OUTPUT || '/tmp/gura61-landing-evidence/browser';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const observations = [], errors = [];
async function settle(page) {
  await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished)));
}
async function capture(page, locale, width, state) {
  await settle(page);
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert(size.scroll <= size.width, 'No horizontal overflow');
  await page.screenshot({ path: path.join(output, `${locale}-${width}-${state}.png`), fullPage: true });
  observations.push({ locale, width, state, ...size, url: page.url() });
}
try {
  for (const width of [360, 768, 1440]) {
    for (const locale of ['en', 'ko']) {
      const context = await browser.newContext({ locale: locale === 'en' ? 'en-US' : 'ko-KR', viewport: { width, height: 900 } });
      await context.route('https://i18n.example/**', route => route.fulfill({ json: response(new URL(route.request().url())), headers: { 'x-cosmos-block-height': '10' } }));
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', msg => { if (msg.type() === 'error' && /hydrati|MISSING_MESSAGE|INVALID_MESSAGE|React error/i.test(msg.text())) errors.push(msg.text()); });
      const url = `${origin}/?chain=second`;
      const res = await page.goto(url, { waitUntil: 'networkidle' });
      assert((await res.text()).includes(`lang="${locale}"`), 'Server locale matches hydration');
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      const trigger = page.locator('header button[aria-haspopup="menu"]');
      const brand = page.getByRole('banner').getByRole('link', { name: 'Gurufin Explorer' });
      const a = await brand.boundingBox(), b = await trigger.boundingBox();
      assert(a.x + a.width < b.x && Math.abs(a.y - b.y) < 20, 'Brand and language button occupy the same row');
      assert(b.width >= 44 && b.height >= 44 && b.x + b.width <= width, 'Visible 44px language target');
      for (const link of await page.getByRole('navigation').getByRole('link').all()) {
        assert((await link.getAttribute('href')).includes('chain=second'), 'Navigation preserves selected chain');
      }
      await capture(page, locale, width, 'closed');
      await trigger.focus(); await page.keyboard.press('Enter');
      const selected = page.getByRole('menuitemradio', { name: locale === 'en' ? 'English' : '한국어' });
      assert.equal(await selected.getAttribute('aria-checked'), 'true');
      assert(await selected.evaluate(el => el === document.activeElement), 'Current locale receives focus');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      const menuId = await trigger.getAttribute('aria-controls');
      assert.equal(await page.getByRole('menu').getAttribute('id'), menuId);
      await capture(page, locale, width, 'open');
      const menu = await page.getByRole('menu').boundingBox();
      assert(menu.x >= 0 && menu.x + menu.width <= width, 'Popup fits viewport');
      await page.keyboard.press('ArrowDown');
      assert(await page.getByRole('menuitemradio', { name: locale === 'en' ? '한국어' : 'English' }).evaluate(el => el === document.activeElement));
      await page.keyboard.press('Escape'); await page.getByRole('menu').waitFor({ state: 'hidden' });
      assert(await trigger.evaluate(el => el === document.activeElement), 'Escape restores trigger focus');
      // Real Server Action persists only locale and refreshes the existing route/query.
      const beforeChain = (await context.cookies()).filter(c => c.name === 'gf_chain');
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      const other = locale === 'en' ? 'ko' : 'en';
      await page.waitForFunction(expected => document.documentElement.lang === expected, other);
      assert.equal(page.url(), url);
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('html').getAttribute('lang'), other);
      assert.equal((await context.cookies()).find(c => c.name === 'explorer-locale')?.value, other);
      assert.deepEqual((await context.cookies()).filter(c => c.name === 'gf_chain'), beforeChain);
      await page.getByRole('navigation').getByRole('link', { name: other === 'en' ? 'Blocks' : '블록', exact: true }).click();
      await page.waitForURL('**/blocks?chain=second');
      assert(await page.getByRole('combobox', { name: other === 'en' ? 'Language' : '언어', exact: true }).count(), 'Explorer retains select variant');
      observations.push({ locale, width, state: 'keyboard-switch-reload-navigation', url: page.url(), persistedLocale: other });
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ observations: observations.length, screenshots: 12, errors }, null, 2));
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ observations, errors }, null, 2));
  await browser.close();
}
