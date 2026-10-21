// Optional real-browser check. Run against a dev server configured with the two synthetic
// chains from chain-search.integration.test.tsx (default key b). All chain HTTP is intercepted.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
import fs from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
const root=fileURLToPath(new URL("../../", import.meta.url));
const base=process.env.W08_BASE_URL ?? "http://127.0.0.1:3218";
const artifacts=process.env.W08_ARTIFACT_DIR ?? path.join(os.tmpdir(), "w08-browser");
fs.mkdirSync(artifacts,{recursive:true});
const block=JSON.parse(fs.readFileSync(root+"/tests/fixtures/w08/e08-lcd.json")).response;
const tx=JSON.parse(fs.readFileSync(root+"/tests/fixtures/w08/e09-tx.json")).response;
const browser=await chromium.launch({channel:"chrome",headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:["clipboard-read","clipboard-write"]});
const page=await context.newPage();
const requests=[];const errors=[];page.on("pageerror",error=>errors.push(error.message));
await context.route(/https:\/\/[ab]\.example\//,async route=>{
 const u=new URL(route.request().url());requests.push(u.href);
 const response=u.pathname.includes("/txs/")?tx:{...block,block:{...block.block,header:{...block.block.header,chain_id:u.hostname==="a.example"?"guru-fixture":"cosmos-fixture",height:u.pathname.split("/").at(-1)}}};
 await route.fulfill({json:response});
});
const homeCases=[];
try {
 for (const chain of ["unknown", "", "a"]) {
  for (const cookie of [true, false]) {
   for (const [label, destination] of [["Open Dashboard", "/dashboard"], ["Start Block Exploration", "/blocks"]]) {
    // Each case starts in a fresh browser context, including the no-cookie cases.
    const homeContext=await browser.newContext();
    try {
     const homePage=await homeContext.newPage();
     const homeRequests=[];
     homePage.on("pageerror",error=>errors.push(error.message));
     await homeContext.route(/https:\/\/[ab]\.example\//,async route=>{
      homeRequests.push(route.request().url());
      await route.fulfill({json:block});
     });
     if(cookie) await homeContext.addCookies([{name:"gf_chain",value:"b",url:base}]);
     await homePage.goto(base+"/?chain="+chain);
     const link=homePage.getByRole("link",{name:label,exact:true});
     await homePage.waitForFunction(({label,href})=>Array.from(document.querySelectorAll("a")).some(a=>a.textContent===label&&a.getAttribute("href")===href),{label,href:destination+"?chain="+chain});
     assert.equal(homeRequests.length,0);
     await link.click();
     await homePage.waitForURL(base+destination+"?chain="+chain);
     if(chain!=="a") {
      await homePage.getByRole("alert").filter({hasText:"설정이 없습니다"}).first().waitFor();
      await homePage.waitForLoadState("networkidle");
      assert.equal(homeRequests.length,0);
      assert.equal((await homeContext.cookies()).find(c=>c.name==="gf_chain")?.value,cookie?"b":undefined);
     } else {
      await homePage.waitForLoadState("networkidle");
      assert(homeRequests.length>0&&homeRequests.every(u=>u.startsWith("https://a.example/")));
     }
     homeCases.push({chain,cookie:cookie?"b":null,destination,requestCount:homeRequests.length,status:"passed"});
    } finally {await homeContext.close();}
   }
  }
 }
 await context.addCookies([{name:"gf_chain",value:"b",url:base}]);
 await page.goto(base+"/blocks/19611674?chain=a");
 await page.getByText("guru-fixture",{exact:true}).waitFor();
 assert(requests.length>0&&requests.every(u=>u.startsWith("https://a.example/")));
 assert.equal(await page.getByRole("combobox").first().textContent(),"Guru fixture");
 await page.getByRole("button",{name:"체인 포함 링크 복사"}).click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),page.url());
 await page.getByRole("link",{name:/높이 .* 보기/}).click();
 await page.waitForURL(/blocks\/19611673\?chain=a/);
 await page.goBack();await page.waitForURL(/19611674\?chain=a/);
 await page.getByRole("combobox").first().click();await page.getByRole("option",{name:"Cosmos fixture"}).click();
 await page.waitForURL(/chain=b/);await page.getByText("cosmos-fixture",{exact:true}).waitFor();
 await page.goBack();await page.waitForURL(/chain=a/);await page.getByText("guru-fixture",{exact:true}).waitFor();
 await page.goForward();await page.waitForURL(/chain=b/);await page.getByText("cosmos-fixture",{exact:true}).waitFor();
 await page.getByRole("textbox").fill("1".repeat(64));await page.getByRole("button",{name:"search",exact:true}).click();
 assert(await page.getByRole("button",{name:"Cosmos tx hash (hex)",exact:true}).isVisible());
 assert(await page.getByRole("button",{name:"블록 높이 (정수)",exact:true}).isVisible());
 await page.screenshot({path:path.join(artifacts,"search.png"),fullPage:true});
 await page.getByRole("button",{name:"블록 높이 (정수)",exact:true}).click();await page.waitForURL(new RegExp("/blocks/"+"1".repeat(64)+"\\?chain=b"));
 await page.getByText("1".repeat(64),{exact:true}).waitFor();
 await page.waitForLoadState("networkidle");
 const count=requests.length;
 await page.goto(base+"/blocks/19611674?chain=unknown");
 await page.getByRole("alert").filter({hasText:"설정이 없습니다"}).first().waitFor();
 assert.equal(requests.length,count);
 await context.clearCookies();
 await page.goto(base+"/tx/"+tx.tx_response.txhash+"?chain=a");
 await page.getByText("MsgEthereumTx",{exact:true}).waitFor();
 assert((await page.getByRole("link",{name:"19611783",exact:true}).getAttribute("href")).endsWith("?chain=a"));
 await page.screenshot({path:path.join(artifacts,"tx.png"),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:"passed",homeCases,cases:["URL A + cookie B","copy chain link","internal detail link","back/forward","selector URL update","ambiguous candidate UI","candidate route","unknown chain zero HTTP","fresh browser URL A","E09 Cosmos summary"],requestCount:requests.length,pageErrors:errors},null,2));
} finally {await browser.close();}
