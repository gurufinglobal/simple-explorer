// Run against an isolated production build with fixture LCD https://i18n.example/lcd.
// PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, BROWSER_ORIGIN and BROWSER_OUTPUT override local paths.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { response as otherResponse } from './i18n-fixture.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/tx-inspection.synthetic.json', import.meta.url), 'utf8'));
const origin = process.env.BROWSER_ORIGIN || 'http://127.0.0.1:3314';
const output = process.env.BROWSER_OUTPUT || '/tmp/gura114-browser';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors = [], cases = [];
try {
  for (const locale of ['ko', 'en']) {
    const context = await browser.newContext({ locale, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    let requests = 0;
    let payload = fixture;
    await context.route('https://i18n.example/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/txs/')) { requests++; await route.fulfill({ json: payload }); }
      else await route.fulfill({ json: otherResponse(url) });
    });
    page.on('pageerror', error => errors.push(error.message));
    const labels = locale === 'ko' ? {
      events: '이벤트 분석 및 Raw', count: '이 출처의 이벤트: 45개', next: '다음', analysis: '분석', copy: 'tx_response.events JSON 복사', copied: '복사했습니다.', raw: '전체 LCD 응답 Raw', rawCopy: '전체 LCD 응답 Raw JSON 복사', messages: '메시지 본문 및 추가 정보', logs: '메시지별 로그 (tx_response.logs)', log: '로그 #1 · 메시지 인덱스 0', logCount: '이 출처의 이벤트: 1개', empty: '빈 목록 (0개)', missing: '제공되지 않음', rawLog: '실행 로그 (raw_log)', invalidLog: 'JSON으로 해석할 수 없는 실행 로그',
    } : {
      events: 'Event analysis and Raw', count: 'Events in this source: 45', next: 'Next', analysis: 'Analysis', copy: 'Copy tx_response.events JSON', copied: 'Copied.', raw: 'Full LCD response Raw', rawCopy: 'Copy Full LCD response Raw JSON', messages: 'Message bodies and additional information', logs: 'Per-message logs (tx_response.logs)', log: 'Log #1 · message index 0', logCount: 'Events in this source: 1', empty: 'Empty list (0)', missing: 'Not provided', rawLog: 'Execution log (raw_log)', invalidLog: 'Execution log cannot be parsed as JSON',
    };
    const summary = label => page.locator('summary').filter({ hasText: label });
    async function overflow(state) {
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
      assert(dimensions.scroll <= dimensions.width, `${locale} ${state}: ${JSON.stringify(dimensions)}`);
    }
    for (const width of locale === 'ko' ? [360, 768, 1280] : [360]) {
      payload = fixture;
      await page.setViewportSize({ width, height: 900 });
      const before = requests;
      await page.goto(`${origin}/tx/0x${'a'.repeat(64)}?chain=fixture`);
      await page.getByText('Detailed fixture', { exact: false }).waitFor({ timeout: 15000 }).catch(async error => { await page.screenshot({ path: path.join(output, 'failure.png') }); console.error(await page.locator('body').innerText(), errors, requests); throw error; });
      assert.equal(requests - before, 1);
      assert.equal(await page.locator('pre').count(), 0);
      await overflow(`${width} summary`);
      await page.screenshot({ path: path.join(output, `${locale}-${width}-summary.png`) });
      await summary(labels.events).focus();
      await page.keyboard.press('Enter');
      await page.getByText(labels.count, { exact: true }).waitFor();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), labels.analysis);
      assert.equal(await page.getByText('#21 custom-18', { exact: true }).count(), 0);
      assert(await page.getByText(/c2VuZGVy: dGVzdA==/).isVisible());
      await overflow(`${width} analysis`);
      await summary(labels.events).evaluate(element => element.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -80));
      await page.screenshot({ path: path.join(output, `${locale}-${width}-events.png`) });
      await page.getByRole('button', { name: labels.next, exact: true }).click();
      await page.getByText('#21 custom-18', { exact: true }).waitFor();
      assert.equal(await page.getByText('#1 transfer', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Raw JSON', exact: true }).click();
      await page.getByRole('button', { name: labels.copy, exact: true }).click();
      await page.getByText(labels.copied, { exact: true }).waitFor();
      assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), fixture.tx_response.events);
      await overflow(`${width} event Raw`);
      await summary(labels.events).evaluate(element => element.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -80));
      await page.screenshot({ path: path.join(output, `${locale}-${width}-raw.png`) });
      await page.getByRole('button', { name: labels.analysis, exact: true }).click();
      await summary(labels.logs).click(); await summary(labels.log).click();
      await page.getByText(labels.logCount, { exact: true }).waitFor();
      await summary(labels.raw).click();
      await page.getByRole('button', { name: labels.rawCopy, exact: true }).click();
      assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), fixture);
      await overflow(`${width} full Raw`);
      assert.equal(requests - before, 1, 'UI inspection must not trigger more requests');
      cases.push(`${locale}/${width}: summary, lazy DOM, keyboard, analysis/Raw, repeated keys, pagination, separate log count, exact clipboard, full payload, no overflow, one detail request`);
    }
    payload = { tx_response: { ...fixture.tx_response, code: 9, events: [], raw_log: 'failed: not JSON', tx: fixture.tx } };
    await page.reload(); await page.getByText('Detailed fixture', { exact: false }).waitFor();
    await summary(labels.events).click(); await page.getByText(labels.empty, { exact: true }).waitFor();
    await summary(labels.rawLog).click(); await page.getByText(labels.invalidLog, { exact: false }).waitFor();
    payload = { tx_response: { txhash: 'A'.repeat(64), height: '42', code: 0 } };
    await page.reload(); await summary(labels.events).click();
    await page.locator('details[open]').getByText(labels.missing, { exact: true }).waitFor();
    cases.push(`${locale}: nested tx fallback, failed code, empty vs absent events, non-JSON execution log`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  const result = { passed: true, at: new Date().toISOString(), origin, source: 'Synthetic HTTP fixtures on isolated production build; no public chain query or signing', cases, errors };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
