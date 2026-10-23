// Start an isolated local fixture configuration for wallet-page.browser.mjs.
// No live chain endpoints or wallet credentials are used.
import { spawn } from 'node:child_process';
import { chain } from './i18n-fixture.mjs';
const origin = process.env.BROWSER_ORIGIN || 'http://127.0.0.1:3265';
const evm = { key: 'evm', name: 'Synthetic EVM', lcdUrl: 'https://i18n.example/lcd', evmRpcUrl: 'https://evm.example', evmChainId: '631',
  evm: { nativeCurrency: { name: 'Synthetic', symbol: 'SYN', decimals: 18 }, feeMode: 'legacy', evidence: 'Synthetic browser test only' } };
const env = { ...process.env, NEXT_PUBLIC_CHAINS: JSON.stringify([{ ...chain, rpcAccess: { ...chain.rpcAccess, origin } }, evm]), NEXT_PUBLIC_DEFAULT_CHAIN_KEY: 'fixture' };
delete env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const production = process.argv.includes('--production');
if (production) {
  const code = await new Promise(resolve => spawn('npm', ['run', 'build'], { stdio: 'inherit', env }).on('exit', resolve));
  if (code !== 0) process.exit(code ?? 1);
}
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', production ? 'start' : 'dev', '-p', new URL(origin).port], { stdio: 'inherit', env });
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', code => process.exit(code ?? 0));
