// Real Next/React browser flow. Only public HTTP and injected wallets are synthetic.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { encodeFunctionResult, erc20Abi } from 'viem';
import { account, pubkey, response } from './i18n-fixture.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.BROWSER_ORIGIN || 'http://127.0.0.1:3265';
const output = process.env.BROWSER_OUTPUT || '/private/tmp/w07-evidence';
fs.mkdirSync(output, { recursive: true });
const from = '0x'+'12'.repeat(20), to = '0x'+'34'.repeat(20), token = '0x'+'56'.repeat(20), hash = '0x'+'ab'.repeat(32);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const cases = [], errors = [];
async function measure(page, name, locale, width) {
  await page.evaluate(() => Promise.allSettled(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished)));
  const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert(size.scroll <= size.client, `${name}: overflow ${size.scroll} > ${size.client}`);
  assert.equal(await page.locator('html').getAttribute('lang'), locale);
  await page.screenshot({ path: `${output}/${locale}-${width}-${name}.png`, fullPage: true });
  cases.push({ name, locale, width, ...size });
  console.log(`${locale} ${width} ${name}: passed`);
}
async function switchLanguage(page, locale) {
  const button = page.getByRole('button', { name: /^(Language|언어)$/ });
  if (await button.count()) {
    await button.click();
    await page.getByRole('menuitemradio', { name: locale === 'en' ? 'English' : '한국어' }).click();
  } else {
    await page.getByRole('combobox', { name: /^(Language|언어)$/ }).click();
    await page.getByRole('option', { name: locale === 'en' ? 'English' : '한국어' }).click();
  }
  await page.waitForFunction(locale => document.documentElement.lang === locale, locale);
}
try {
for (const width of [360,768,1440]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US' });
  let failCosmos = false, failReward = false, failEvm = false;
  await context.route('https://i18n.example/**', async route => {
    assert(!/broadcast/.test(route.request().url()+route.request().postData()), 'No real Cosmos broadcast');
    if (failCosmos || failReward && route.request().url().endsWith('/rewards')) return route.fulfill({ status:503,body:'Unavailable' });
    await route.fulfill({ json: response(new URL(route.request().url())), headers:{'x-cosmos-block-height':'10'} });
  });
  await context.route('https://evm.example/**', async route => {
    if (failEvm) return route.fulfill({ status:503,body:'Unavailable' });
    const { id, method, params } = route.request().postDataJSON();
    let result;
    switch(method) {
      case 'eth_chainId': result='0x277';break;
      case 'eth_getBalance': result='0x3635c9adc5dea00000';break;
      case 'eth_getTransactionCount': result='0x2';break;
      case 'eth_getCode': result='0x1234';break;
      case 'eth_estimateGas': result='0x5208';break;
      case 'eth_gasPrice': result='0x3b9aca00';break;
      case 'eth_getTransactionReceipt': result={transactionHash:hash,transactionIndex:'0x0',blockHash:hash,blockNumber:'0x1',from,to,cumulativeGasUsed:'0x5208',gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00',status:'0x1',type:'0x0',logs:[],logsBloom:'0x'+'00'.repeat(256),contractAddress:null};break;
      case 'eth_call': {
        const selector=params[0].data.slice(0,10);
        const fn = selector==='0x313ce567'?'decimals':selector==='0x95d89b41'?'symbol':selector==='0xa9059cbb'?'transfer':'balanceOf';
        result=encodeFunctionResult({abi:erc20Abi,functionName:fn,result:fn==='decimals'?6:fn==='symbol'?'TOK':fn==='transfer'?true:900719925474099123456n});break;
      }
      default: throw new Error(`Unexpected RPC ${method}`);
    }
    await route.fulfill({json:{jsonrpc:'2.0',id,result}});
  });
  await context.addInitScript(({from,hash,account,pubkey})=>{
    window.__signs=0;window.__walletAccounts=[from];window.__walletChain='0x277';window.__events={};
    window.ethereum={isMetaMask:true,on:(name,cb)=>window.__events[name]=cb,removeListener:name=>delete window.__events[name],request:async({method,params})=>{
      if(method==='eth_chainId')return window.__walletChain;
      if(method==='eth_accounts'||method==='eth_requestAccounts')return window.__walletAccounts;
      if(method==='wallet_switchEthereumChain'){window.__walletChain=params[0].chainId;return null;}
      if(method==='eth_sendTransaction'){window.__signs++;return hash;}
      throw new Error(method);
    }};
    window.keplr={enable:async()=>{}};
    window.getOfflineSigner=()=>({getAccounts:async()=>[{address:account,pubkey:new Uint8Array(pubkey),algo:'secp256k1'}],signDirect:async()=>{throw new Error('Unexpected Cosmos signature');}});
  },{from,hash,account,pubkey});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error'&&/hydrati|MISSING_MESSAGE|INVALID_MESSAGE|React error/i.test(msg.text()))errors.push(msg.text());});
  await page.goto(origin+'/wallet?chain=evm');
  await page.getByRole('heading',{name:'My wallet',exact:true}).waitFor();
  await page.getByText(/After a page reload/).waitFor();
  await measure(page,'disconnected','en',width);
  await page.getByRole('button',{name:'Connect MetaMask',exact:true}).click();
  await page.getByRole('button',{name:/MetaMask \(legacy\)/}).click();
  await page.getByText('EVM · Ready for review',{exact:true}).waitFor();
  await page.getByText('1000 SYN',{exact:true}).waitFor();
  await page.getByLabel('ERC20 contract address',{exact:true}).fill(token);
  await page.getByRole('button',{name:'Query token',exact:true}).click();
  await page.getByText('900719925474099.123456 TOK',{exact:true}).waitFor();
  await measure(page,'evm-assets','en',width);
  await page.getByRole('tab',{name:'Assets',exact:true}).focus();
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('tab',{name:'Activity',exact:true}).getAttribute('aria-selected'),'true');
  const qr=page.getByRole('button',{name:'EVM QR',exact:true});
  await qr.click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  assert(await qr.evaluate(node=>node===document.activeElement),'QR focus restored');
  await page.getByRole('tab',{name:'Send',exact:true}).click();
  await page.getByLabel('Recipient EVM address',{exact:true}).fill(to);await page.getByLabel('Amount',{exact:true}).fill('1');
  await page.getByRole('button',{name:'Review transfer',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();await measure(page,'confirmation','en',width);
  await dialog.getByRole('button',{name:'Confirm and request wallet',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByText(hash,{exact:true}).waitFor();
  await page.getByText(/Confirmed success/).waitFor();
  failEvm=true;
  await page.getByRole('button',{name:'Retry Native asset',exact:true}).click();
  await page.getByRole('status',{name:'Native asset query status',exact:true}).filter({hasText:'Refresh failed'}).waitFor();
  await page.getByText(/Confirmed success/).waitFor();
  await measure(page,'success-stale-balance','en',width);
  failEvm=false;
  await page.getByRole('button',{name:'Retry Native asset',exact:true}).click();
  await page.getByRole('tab',{name:'Contract',exact:true}).click();
  await page.getByLabel('Contract address',{exact:true}).fill(token);
  await page.getByLabel('ABI JSON',{exact:true}).fill(JSON.stringify(erc20Abi.filter(fn=>fn.type==='function'&&fn.name==='balanceOf')));
  await page.getByRole('combobox',{name:'Function signature',exact:true}).click();await page.getByRole('option',{name:/balanceOf/}).click();
  await page.getByLabel('Arguments JSON',{exact:true}).fill(JSON.stringify([from]));
  await page.getByRole('button',{name:'Read contract',exact:true}).click();
  await page.getByText(/900719925474099123456/).waitFor();
  await measure(page,'contract','en',width);
  await switchLanguage(page,'ko');
  await page.getByText('EVM · 거래 검토 가능',{exact:true}).waitFor();
  await measure(page,'contract','ko',width);
  assert.equal(await page.evaluate(()=>window.__signs),1);
  await page.getByRole('tab',{name:'자산',exact:true}).click();await measure(page,'evm-assets','ko',width);
  await page.reload();await page.getByText(/페이지를 새로고침한 뒤에는/).waitFor();
  await page.getByRole('button',{name:'MetaMask 연결',exact:true}).click();await page.getByRole('button',{name:/MetaMask \(legacy\)/}).click();
  await page.getByText(hash,{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__signs),0,'No signing on reload');
  await page.evaluate(to=>{window.__walletAccounts=[to];window.__events.accountsChanged?.([to]);},to);
  await page.getByText(/페이지를 새로고침한 뒤에는/).waitFor();
  assert.equal(await page.getByText('1000 SYN',{exact:true}).count(),0);
  await page.goto(origin+'/wallet?chain=fixture');
  failReward=true;
  await page.getByRole('button',{name:'Keplr 연결',exact:true}).click();
  await page.getByText('Cosmos · 거래 검토 가능',{exact:true}).waitFor();
  await page.getByText('9007199254740993123.456789 GXN',{exact:true}).first().waitFor();
  await measure(page,'cosmos-partial','ko',width);
  await switchLanguage(page,'en');await measure(page,'cosmos-partial','en',width);
  failCosmos=true;
  await page.getByRole('button',{name:'Retry Cosmos assets and positions',exact:true}).click();
  await page.getByRole('status',{name:'Cosmos assets and positions query status',exact:true}).filter({hasText:'Refresh failed'}).waitFor();
  await measure(page,'cosmos-stale','en',width);
  failCosmos=false;failReward=false;
  await page.getByRole('button',{name:'Retry Cosmos assets and positions',exact:true}).click();
  await page.getByRole('tab',{name:'Activity',exact:true}).click();
  await page.getByText(/Indexed sender/).waitFor();
  await measure(page,'cosmos-activity','en',width);
  await page.getByRole('link',{name:'View public address',exact:true}).click();
  await page.getByText('Address details',{exact:true}).waitFor();
  assert(page.url().includes('chain=fixture'));
  await measure(page,'public-address','en',width);
  assert.equal(await page.evaluate(()=>window.__signs),0);
  await context.close();
}
assert.deepEqual(errors,[]);
fs.writeFileSync(`${output}/result.json`,JSON.stringify({cases,errors,mode:'Synthetic HTTP and injected wallets; no real signing/broadcast'},null,2));
console.log(JSON.stringify({passed:cases.length,errors},null,2));
} finally { await browser.close(); }
