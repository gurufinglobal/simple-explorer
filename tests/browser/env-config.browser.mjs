// Isolated Next dev + production verification. Only HTTP is mocked; app loaders,
// env conversion, URL helpers, SSR, hydration and dashboard are real.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { response } from './i18n-fixture.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(import.meta.dirname, '../..');
const output = process.env.BROWSER_OUTPUT || '/tmp/gura74-browser';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceDirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim());
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
for (const key of Object.keys(env)) if (key.startsWith('NEXT_PUBLIC_') || key === '__NEXT_PROCESSED_ENV' || key === 'NODE_ENV') delete env[key];
const probe = `
import { getActiveChainConfig } from '@/lib/chain-selection';
import { apiClients } from '@/services/clients';
export function snapshot() {
  const safe = (fn: () => string) => { try { return fn(); } catch (e) { return { error: (e as Error).message }; } };
  return { chain: getActiveChainConfig(), lcd: safe(() => apiClients.lcdUrl('/cosmos/base/tendermint/v1beta1/node_info')),
    rpc: safe(() => apiClients.rpcUrl('/status')), evm: safe(() => apiClients.evmRpcUrl('/')) };
}
`;
const client = `"use client";
import { useEffect, useState } from 'react';
import { snapshot } from './snapshot';
import { apiClients } from '@/services/clients';
export default function Probe() {
  const [value, setValue] = useState(''); const [calls, setCalls] = useState('');
  useEffect(() => { setValue(JSON.stringify(snapshot())); }, []);
  return <><pre id="client">{value}</pre><button id="probe" onClick={async () => {
    const result = await Promise.allSettled([apiClients.lcdGet('/cosmos/base/tendermint/v1beta1/node_info'), apiClients.rpcGet('/status'), apiClients.evmRpcGet('/')]);
    setCalls(JSON.stringify(result.map(r => r.status === 'fulfilled' ? 'fulfilled' : r.reason.message)));
  }}>Probe HTTP</button><pre id="calls">{calls}</pre></>;
}
`;
function prepare(variant) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `gura74-${variant}-`));
  // Only tracked and nonignored source files; never copy personal env or .next.
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  for (const name of files) {
    if (name.startsWith('.env') && name !== '.env.test') continue;
    const destination = path.join(directory, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, name), destination);
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  const example = fs.readFileSync(path.join(root, 'env.example'), 'utf8');
  let config = example;
  if (variant === 'tgxn') config = example.split('\n').map(line => {
    if (/^NEXT_PUBLIC_(LCD|RPC|EVM_RPC|WS)_URL=/.test(line)) return '# ' + line;
    if (line.startsWith('# NEXT_PUBLIC_CHAINS=') && line.includes('"key":"tgxn"')) return line.slice(2);
    if (line === '# NEXT_PUBLIC_DEFAULT_CHAIN_KEY=tgxn') return line.slice(2);
    return line;
  }).join('\n');
  if (variant === 'lcd-only') config = 'NEXT_PUBLIC_LCD_URL=https://lcd-only.example.invalid\n';
  if (variant !== 'empty') {
    fs.writeFileSync(path.join(directory, '.env.development.local'), config);
    fs.writeFileSync(path.join(directory, '.env.production.local'), config);
  }
  const route = path.join(directory, 'src/app/env-verification');
  fs.mkdirSync(route, { recursive: true });
  fs.writeFileSync(path.join(route, 'snapshot.ts'), probe);
  fs.writeFileSync(path.join(route, 'client.tsx'), client);
  fs.writeFileSync(path.join(route, 'page.tsx'), `import Probe from './client'; import { snapshot } from './snapshot'; export const dynamic = 'force-dynamic'; export default function Page() { return <><pre id="server">{JSON.stringify(snapshot())}</pre><Probe /></>; }`);
  return directory;
}
async function command(command, args, directory, log) {
  const fd = fs.openSync(log, 'w');
  const child = spawn(command, args, { cwd: directory, env, stdio: ['ignore', fd, fd] });
  const [code] = await once(child, 'exit'); fs.closeSync(fd);
  assert.equal(code, 0, `${command} ${args.join(' ')} failed; see ${log}`);
}
async function observe(directory, variant, mode) {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const fd = fs.openSync(`${output}/${variant}-${mode}-server.log`, 'w');
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', mode === 'production' ? 'start' : 'dev', '-H', '127.0.0.1', '-p', String(port)], { cwd: directory, env, stdio: ['ignore', fd, fd] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
  const requests = [], errors = [];
  const result = { variant, mode, origin, project: directory, sourceSha, sourceDirty,
    buildId: mode === 'production' ? fs.readFileSync(path.join(directory, '.next/BUILD_ID'), 'utf8').trim() : 'development',
    observedAt: new Date().toISOString(), browser: browser.version(), syntheticHttp: true, requests, errors };
  results.push(result);
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
      if (fs.readFileSync(`${output}/${variant}-${mode}-server.log`, 'utf8').includes('Ready in')) {
        try { const r = await fetch(origin); if (r.ok) { ready = true; break; } } catch {}
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert(ready, 'isolated server ready');
    await context.addCookies([{ name: 'explorer-locale', value: 'en', url: origin }]);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      requests.push(url.href);
      return route.fulfill({ json: response(url) });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error' && /hydrati|MISSING_MESSAGE|INVALID_MESSAGE|React error/i.test(msg.text())) errors.push(msg.text()); });
    const home = await page.goto(origin);
    const html = await home.text();
    if (variant === 'empty') {
      assert(html.includes('Chain configuration is missing.'));
      await page.getByRole('alert').filter({ hasText: 'Chain configuration is missing.' }).waitFor();
      assert.equal(requests.length, 0);
      result.configurationError = true;
    } else {
      const name = variant === 'tgxn' ? 'TGXN' : 'Default';
      assert(html.includes(name), 'server-rendered home names configured chain');
      await page.goto(origin + '/env-verification');
      await page.waitForFunction(() => document.getElementById('client')?.textContent);
      const server = JSON.parse(await page.locator('#server').textContent());
      const client = JSON.parse(await page.locator('#client').textContent());
      assert.deepEqual(client, server, 'compiled server and browser configuration match');
      assert.equal(client.chain.name, name);
      const lcd = variant === 'tgxn' ? 'https://tgxn.gurufin.io:1317' : variant === 'lcd-only' ? 'https://lcd-only.example.invalid' : 'https://trpc.gurufin.io:1317';
      assert.equal(client.chain.lcdUrl, lcd);
      await page.locator('#probe').click();
      await page.waitForFunction(() => document.getElementById('calls')?.textContent);
      const calls = JSON.parse(await page.locator('#calls').textContent());
      assert.equal(calls[0], 'fulfilled');
      assert.equal(calls[1], variant === 'lcd-only' ? 'Selected chain does not provide rpcUrl.' : 'fulfilled');
      assert.equal(calls[2], variant === 'trpc' ? 'fulfilled' : 'Selected chain does not provide evmRpcUrl.');
      assert.deepEqual(requests, [client.lcd, ...(typeof client.rpc === 'string' ? [client.rpc] : []), ...(typeof client.evm === 'string' ? [client.evm] : [])]);
      result.server = server; result.client = client; result.calls = calls;
      await page.goto(origin + '/dashboard');
      await page.getByRole('combobox', { name: /Select chain/i }).waitFor();
      await page.waitForFunction(expected => document.querySelector('[id="desktop-chain"]')?.textContent === expected || [...document.querySelectorAll('[role="combobox"]')].some(el => el.textContent === expected), name);
      await page.waitForFunction(() => document.body.textContent.includes('i18n-fixture-1'));
      assert(requests.some(url => url === lcd + '/cosmos/base/tendermint/v1beta1/node_info'));
      assert(requests.every(url => url.startsWith(lcd + '/') || url === client.rpc || url === client.evm), 'all HTTP uses configured endpoints');
      result.dashboard = true;
    }
    await page.screenshot({ path: `${output}/${variant}-${mode}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    result.passed = true;
    console.log(`${variant} ${mode}: passed`);
  } finally {
    await context.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
    }
    fs.closeSync(fd);
    fs.writeFileSync(`${output}/result.json`, JSON.stringify(results, null, 2));
  }
}
try {
  for (const variant of ['trpc', 'tgxn', 'lcd-only', 'empty']) {
    const directory = prepare(variant);
    await observe(directory, variant, 'development');
    if (variant === 'trpc' || variant === 'tgxn') {
      console.log(`${variant}: npm run build (${directory})`);
      await command('npm', ['run', 'build'], directory, `${output}/${variant}-build.log`);
      await observe(directory, variant, 'production');
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ passed: results.filter(r => r.passed).length, output }));
