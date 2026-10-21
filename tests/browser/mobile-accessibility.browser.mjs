// Production Chrome + synthetic HTTP/Keplr boundaries. No real signer or broadcasts.
// The validation runner supplies the public synthetic chain configuration and valid fixture addresses.
// PLAYWRIGHT_MODULE, BROWSER_ORIGIN, BROWSER_OUTPUT, BROWSER_BUILD; BROWSER_BEFORE=1 records baseline only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.BROWSER_ORIGIN || 'http://127.0.0.1:3227';
const output = process.env.BROWSER_OUTPUT || '/tmp/gura47-browser';
const before = process.env.BROWSER_BEFORE === '1';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const block = JSON.parse(fs.readFileSync(new URL('../fixtures/w08/e08-lcd.json', import.meta.url))).response;
const sender = 'guru1qyqszqgpqyqszqgpqyqszqgpqyqszqgp4034pt';
// Address checked below from the project's bech32 library by the validation runner.
const validator = process.env.BROWSER_VALIDATOR;
const account = process.env.BROWSER_ACCOUNT || sender;
assert(validator, 'BROWSER_VALIDATOR required (valid guruvaloper fixture)');
const long = 'x'.repeat(160), denom = `ibc/${long}`;
const errors = [], cases = [], requests = [];
let broadcasts = 0;
const validatorData = { operator_address: validator, description: { moniker: 'Keyboard Validator', details: long, website: long }, tokens: '123456789123456789', status: 'BOND_STATUS_BONDED', jailed: false, min_self_delegation: '1' };
async function boundary(route) {
 const u = new URL(route.request().url()); requests.push(u.href);
 let json;
 if (u.pathname.includes('broadcast') || route.request().postData()?.includes('broadcast_tx')) { broadcasts++; throw new Error('Unexpected broadcast'); }
 if (u.pathname.startsWith('/rpc')) json = { jsonrpc: '2.0', id: 1, result: { node_info: { network: 'guru-fixture' } } };
 else if (u.pathname.endsWith('/node_info')) json = { default_node_info: { network: 'guru-fixture' } };
 else if (u.pathname.endsWith('/channels')) {
   if (u.searchParams.has('pagination.key')) { await route.fulfill({ status: 503, body: '' }); return; }
   json = { channels: [{ port_id: 'transfer', channel_id: 'channel-1', state: 'STATE_OPEN', version: long, connection_hops: [long], counterparty: { port_id: 'transfer', channel_id: 'channel-99' } }], pagination: { next_key: 'more', total: '0' } };
 } else if (u.pathname.endsWith('/denoms_metadata')) json = { metadatas: [{ base: 'agxn', display: 'gxn', symbol: 'GXN', denom_units: [{ denom: 'agxn', exponent: 0 }, { denom: 'gxn', exponent: 6 }] }] };
 else if (u.pathname.includes('/blocks/')) json = { ...block, block: { ...block.block, header: { ...block.block.header, height: u.pathname.endsWith('/latest') ? '100' : u.pathname.split('/').at(-1), chain_id: 'guru-fixture' } } };
 else if (u.pathname.endsWith('/validators')) json = { validators: [validatorData], pagination: { next_key: null, total: '1' } };
 else if (u.pathname.endsWith(`/validators/${validator}`)) json = { validator: validatorData };
 else if (u.pathname.includes(`/validators/${validator}/delegations/`)) json = { delegation_response: { delegation: { delegator_address: account, validator_address: validator }, balance: { amount: '10000000', denom: 'agxn' } } };
 else if (u.pathname.endsWith('/delegations')) json = { delegation_responses: [{ balance: { amount: '10000000', denom: 'agxn' } }] };
 else if (u.pathname.endsWith('/outstanding_rewards')) json = { rewards: { rewards: [{ amount: '1.00001', denom }] } };
 else if (u.pathname.endsWith('/commission')) json = { commission: { commission: [] } };
 else if (u.pathname.includes('/rewards/')) json = { rewards: [] };
 else if (u.pathname.endsWith('/rewards')) json = { total: [] };
 else if (u.pathname.includes('/unbonding_delegations/')) json = { unbond: { entries: [] } };
 else if (u.pathname.includes('/unbonding_delegations')) json = { unbonding_responses: [] };
 else if (u.pathname.includes('/spendable_balances/') || u.pathname.includes('/balances/')) json = { balances: [{ amount: '999999999', denom: 'agxn' }] };
 else if (u.pathname.includes('/accounts/')) json = { account: { account_number: '1', sequence: '0' } };
 else if (u.pathname.endsWith('/accounts')) json = { accounts: [], pagination: { total: '1' } };
 else if (u.pathname.endsWith('/params')) json = { params: { bond_denom: 'agxn', unbonding_time: '86400s' } };
 else if (u.pathname.endsWith('/supply/by_denom')) json = { amount: { amount: '999999999', denom: 'agxn' } };
 else if (u.pathname.endsWith('/pool')) json = { pool: { bonded_tokens: '1234567' } };
 else if (u.pathname.endsWith('/inflation')) json = { inflation: '0.01' };
 else if (u.pathname.endsWith('/txs')) json = { tx_responses: [], txs: [], pagination: { total: '0' } };
 else if (u.pathname.endsWith('/proposals')) json = { proposals: [], pagination: { total: '0' } };
 else { await route.fulfill({ status: 503, body: '' }); return; }
 await route.fulfill({ json });
}
async function tabTo(page, target) {
 const trail = [];
 for (let i = 0; i < 100; i++) {
  if (await target.evaluate(el => el === document.activeElement)) return;
  await page.keyboard.press('Tab');
  trail.push(await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.slice(0, 80), label: document.activeElement?.getAttribute('aria-label') })));
 }
 await page.screenshot({ path: path.join(output, "keyboard-failure.png"), fullPage: true });
 throw new Error(`Keyboard target not reached: ${await target.textContent()} ${JSON.stringify(trail.slice(-12))}`);
}
async function measure(page, width, name, controls = []) {
 await page.evaluate(() => Promise.allSettled(document.getAnimations()
  .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
  .map(animation => animation.finished)));
 const size = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
 const visible = [];
 for (const locator of controls) {
  await locator.click({ trial: true }); // Wait for MUI opening transitions to finish without activating the control.
  const box = await locator.boundingBox();
  const ok = !!box && box.width > 0 && box.x >= 0 && box.x + box.width <= width + 1;
  visible.push({ name: await locator.getAttribute('aria-label') || await locator.textContent(), insideViewport: ok });
  if (!before) assert(ok, `${name}: core control outside viewport`);
 }
 cases.push({ name, width, ...size, controls: visible, at: new Date().toISOString() });
 await page.screenshot({ path: path.join(output, `${width}-${name}.png`), fullPage: !name.startsWith('confirm-') });
 if (!before) assert(size.scrollWidth <= size.clientWidth, `${name} width ${width}: document overflow ${size.scrollWidth}`);
}
try {
 for (const width of [360, 768, 1280]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.route(/https:\/\/[ab]\.example\//, boundary);
  await context.addInitScript(({ account }) => {
   window.__walletSigns = 0;
   window.ethereum = { request: async () => ['0x' + '1'.repeat(40)], on: () => {}, removeListener: () => {} };
   window.keplr = { enable: async () => {} };
   window.getOfflineSigner = () => ({ getAccounts: async () => [{ address: account, pubkey: new Uint8Array(33).fill(3), algo: 'secp256k1' }], signDirect: async () => { window.__walletSigns++; throw new Error('Must not sign'); } });
  }, { account });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/?chain=a`);
  await measure(page, width, 'home', [page.getByRole('link', { name: 'Open Dashboard' }), page.getByRole('link', { name: 'Start Block Exploration' })]);
  await page.goto(`${origin}/dashboard?chain=a`);
  await page.getByRole('textbox').first().waitFor();
  await page.getByText('guru-fixture', { exact: true }).first().waitFor();
  await measure(page, width, 'dashboard', [page.getByRole('textbox').first(), page.getByRole('button', { name: 'wallet menu' })]);
  if (!before) {
   const wallet = page.getByRole('button', { name: 'wallet menu' });
   await tabTo(page, wallet); await page.keyboard.press('Enter');
   await measure(page, width, 'wallet-open', [page.getByRole('menuitem', { name: 'Keplr', exact: true })]);
   await page.keyboard.press('Escape');
   await page.locator('[role="menu"]').waitFor({ state: 'detached' });
   assert(await wallet.evaluate(el => el === document.activeElement));
   if (width < 900) {
    const menu = page.getByRole('button', { name: '탐색 메뉴 열기' });
    await tabTo(page, menu); await page.keyboard.press('Enter');
    await measure(page, width, 'drawer-open', [page.getByRole('combobox'), page.getByRole('link', { name: 'IBC Channels', exact: true })]);
    await tabTo(page, page.getByRole('combobox')); await page.keyboard.press('Enter');
    await page.getByRole('option', { name: 'Guru fixture' }).waitFor(); await page.keyboard.press('Escape');
    await tabTo(page, page.getByRole('button', { name: '탐색 메뉴 닫기' })); await page.keyboard.press('Enter');
    await page.getByRole('combobox').waitFor({ state: 'hidden' });
    assert(await menu.evaluate(el => el === document.activeElement));
   }
  }
  await page.goto(`${origin}/operations?chain=a`);
  await page.getByText('channel-1', { exact: true }).waitFor();
  await measure(page, width, 'ibc');
  if (!before) {
   assert.equal(await page.getByText(/CCMs|최종 확인/).count(), 0);
   const scroll = page.getByRole('region', { name: 'IBC 채널 목록 가로 스크롤' });
   await tabTo(page, scroll); await page.keyboard.press('ArrowRight');
   if (await scroll.evaluate(el => el.scrollWidth > el.clientWidth)) {
    await page.waitForFunction(() => document.querySelector('[aria-label="IBC 채널 목록 가로 스크롤"]').scrollLeft > 0);
   }
   await page.getByRole('button', { name: '목록 이어보기', exact: true }).click();
   await page.getByRole('alert', { name: '조회 오류' }).waitFor();
   assert(await page.getByText('channel-1', { exact: true }).isVisible());
   await measure(page, width, 'ibc-partial');
   const input = page.getByRole('textbox', { name: '블록 높이 / Cosmos tx hash (hex) / 계정 주소' });
   await tabTo(page, input); await page.keyboard.type('?'); await page.keyboard.press('Enter');
   await page.getByRole('alert', { name: '검색 오류' }).waitFor();
   await measure(page, width, 'search-error');
   await page.keyboard.press('Escape'); assert(await input.evaluate(el => el === document.activeElement));
   await input.fill('1'.repeat(64)); await page.keyboard.press('Enter');
   await tabTo(page, page.getByRole('button', { name: '블록 높이 (정수)', exact: true })); await page.keyboard.press('Enter');
   await page.waitForURL(/\/blocks\/1+\?chain=a/);
   await measure(page, width, 'long-block');
   if (width < 900) { await tabTo(page, page.getByRole('button', { name: '탐색 메뉴 열기' })); await page.keyboard.press('Enter'); }
   await tabTo(page, page.getByRole('link', { name: 'Staking', exact: true })); await page.keyboard.press('Enter');
   await page.waitForURL(/\/staking\?chain=a/);
  } else await page.goto(`${origin}/staking?chain=a`);
  await page.getByText('Keyboard Validator', { exact: true }).waitFor();
  await measure(page, width, 'validators');
  if (!before) {
   const raw = page.getByRole('button', { name: '원본 금액', exact: true }).first();
   await tabTo(page, raw); await page.keyboard.press('Enter'); assert.equal(await raw.getAttribute('aria-expanded'), 'true');
   assert(new URL(page.url()).pathname === '/staking');
   const link = page.getByRole('link', { name: 'Keyboard Validator' });
   await tabTo(page, link); await page.keyboard.press('Enter'); await page.waitForURL(/\/staking\/guruvaloper/);
  } else await page.goto(`${origin}/staking/${validator}?chain=a`);
  await page.getByText('Validator 상세', { exact: true }).waitFor();
  await measure(page, width, 'validator-detail');
  if (!before) {
   assert(await page.getByRole('button', { name: 'Delegate', exact: true }).isDisabled());
   await tabTo(page, page.getByRole('button', { name: 'wallet menu' })); await page.keyboard.press('Enter');
   await page.getByRole('menuitem', { name: 'WalletConnect QR / mobile wallet' }).waitFor();
   await page.keyboard.press('ArrowDown');
   assert(await page.getByRole('menuitem', { name: 'Keplr', exact: true }).evaluate(el => el === document.activeElement));
   await page.keyboard.press('Enter');
   await page.getByText(/쓰기 가능/).waitFor();
   const amount = page.getByRole('textbox', { name: '수량 (표시 단위)', exact: true });
   await tabTo(page, amount); await page.keyboard.type('1.234567');
   await tabTo(page, page.getByRole('checkbox', { name: '표시 수량과 전송 원본을 확인했습니다' })); await page.keyboard.press('Space');
   const trigger = page.getByRole('button', { name: 'Delegate', exact: true });
   for (const method of ['Escape', 'Enter']) {
    await tabTo(page, trigger); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '거래 실행 전 확인' }); await dialog.waitFor();
    const cancel = dialog.getByRole('button', { name: '취소', exact: true });
    assert(await cancel.evaluate(el => el === document.activeElement), 'initial cancel focus');
    await page.keyboard.press('Shift+Tab'); assert(await dialog.getByRole('button', { name: '확인하고 지갑 서명' }).evaluate(el => el === document.activeElement));
    await page.keyboard.press('Tab'); assert(await cancel.evaluate(el => el === document.activeElement));
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); assert(await cancel.evaluate(el => el === document.activeElement));
    await measure(page, width, `confirm-${method}`, [cancel]);
    await page.keyboard.press(method); await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    assert(await trigger.evaluate(el => el === document.activeElement), `trigger restored: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 500))}`);
    assert.equal(await page.evaluate(() => window.__walletSigns), 0);
   }
   await tabTo(page, page.getByRole('button', { name: 'wallet menu' })); await page.keyboard.press('Enter');
   await page.getByRole('menuitem', { name: 'WalletConnect QR / mobile wallet' }).waitFor();
   await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
   assert(await page.getByRole('menuitem', { name: 'MetaMask', exact: true }).evaluate(el => el === document.activeElement));
   await page.keyboard.press('Enter');
   await page.getByText('MetaMask는 Cosmos 조회 전용입니다. Keplr 또는 WalletConnect로 다시 연결하세요.').first().waitFor();
   assert(await trigger.isDisabled());
   await measure(page, width, 'wallet-write-blocked', [page.getByRole('button', { name: 'wallet menu' })]);
   cases.push({ name: 'keyboard-search-list-detail-confirm-cancel', width, signerCalls: await page.evaluate(() => window.__walletSigns), broadcasts });
  }
  await context.close();
 }
 assert.deepEqual(errors, []); assert.equal(broadcasts, 0);
 console.log(JSON.stringify({ passed: true, browserVersion: browser.version(), before, origin, build: process.env.BROWSER_BUILD, chain: 'a', environment: 'desktop Chrome viewport; synthetic HTTP/Keplr; not physical mobile or screen reader', cases, errors, broadcasts, requestCount: requests.length }, null, 2));
} finally {
 fs.writeFileSync(path.join(output, 'observations.json'), JSON.stringify({ browserVersion: browser.version(), before, origin, build: process.env.BROWSER_BUILD, cases, errors, broadcasts, requestCount: requests.length }, null, 2));
 await browser.close();
}
