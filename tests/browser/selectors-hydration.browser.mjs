// Run against wallet-page-server.mjs in dev AND production. No real wallet or chain.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { response } from './i18n-fixture.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.BROWSER_ORIGIN || 'http://127.0.0.1:3265';
const output = process.env.BROWSER_OUTPUT || '/private/tmp/selectors-hydration';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const cases = [], errors = [];
async function references(page) {
  const issues = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[id]')], ids = all.map(e => e.id);
    const duplicate = ids.filter((id, i) => ids.indexOf(id) !== i);
    const missing = [...document.querySelectorAll('[aria-labelledby], [aria-controls]')].flatMap(el =>
      ['aria-labelledby', 'aria-controls'].flatMap(attr => (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean)
        .filter(id => !document.getElementById(id)).map(id => `${attr}:${id}`)));
    return { duplicate, missing };
  });
  assert.deepEqual(issues, { duplicate: [], missing: [] });
}
try {
  for (const width of [360, 768, 1440]) for (const locale of ['ko', 'en']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: locale === 'ko' ? 'ko-KR' : 'en-US' });
    await context.addCookies([{ name: 'explorer-locale', value: locale, url: origin }]);
    await context.route('https://i18n.example/**', route => route.fulfill({ json: response(new URL(route.request().url())) }));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push({ width, locale, message: e.message }));
    page.on('console', msg => { if (msg.type() === 'error' && /hydrati|MISSING_MESSAGE|INVALID_MESSAGE|React error/i.test(msg.text())) errors.push({ width, locale, message: msg.text() }); });
    for (let reload = 0; reload < 6; reload++) {
      const reply = await page.goto(origin + '/wallet?chain=fixture');
      const html = await reply.text();
      const ssrLabels = [...html.matchAll(/<label[^>]*id="([^"]+)"/g)].map(m => m[1]);
      assert(ssrLabels.length >= 2, 'Language and desktop chain labels must be server-rendered');
      await page.getByRole('combobox', { name: /^(Language|언어)$/ }).waitFor();
      await page.waitForFunction(() => document.querySelector('[role="combobox"][aria-labelledby*="chain"]')?.textContent);
      for (const id of ssrLabels) assert.equal(await page.locator(`[id="${id}"]`).count(), 1, 'SSR label identity survives hydration');
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      await references(page);
    }
    const language = page.getByRole('combobox', { name: /^(Language|언어)$/ });
    await language.focus(); await page.keyboard.press('Space');
    await page.getByRole('listbox').waitFor(); await references(page);
    await page.keyboard.press('Escape');
    assert(await language.evaluate(el => el === document.activeElement), 'Language focus returns on Escape');
    await page.keyboard.press('Space');
    const next = locale === 'ko' ? 'en' : 'ko';
    await page.keyboard.press(next === 'en' ? 'Home' : 'End'); await page.keyboard.press('Enter');
    await page.waitForFunction(next => document.documentElement.lang === next, next);
    await page.reload();
    await language.waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), next);
    assert((await context.cookies()).some(c => c.name === 'explorer-locale' && c.value === next), 'Server Action persists locale');
    if (width < 900) await page.getByRole('button', { name: /Open navigation|내비게이션 열기|탐색 메뉴 열기/ }).click();
    const chain = page.getByRole('combobox', { name: /Select chain|체인 선택/ });
    await chain.focus(); await page.keyboard.press('Space');
    await page.getByRole('listbox').waitFor(); await references(page);
    await page.keyboard.press('Escape');
    assert(await chain.evaluate(el => el === document.activeElement), 'Chain focus returns on Escape');
    await references(page);
    await page.evaluate(() => Promise.allSettled(document.getAnimations()
      .filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished)));
    await page.screenshot({ path: `${output}/${locale}-${width}.png`, fullPage: true });
    cases.push({ width, locale, reloads: 6, persistedLocale: next, keyboardFocusAndAria: true });
    console.log(`${locale} ${width}: passed`);
    await context.close();
  }
} finally {
  fs.writeFileSync(`${output}/result.json`, JSON.stringify({ cases, errors }, null, 2));
  await browser.close();
}
assert.deepEqual(errors, []);
console.log(JSON.stringify({ passed: cases.length, errors }));
