import { afterEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getConfiguredChains, getDefaultChainKey, readPublicEnv, parseChainConfigs } from "@/lib/env";
import { apiClients, createQueryClient } from "@/services/clients";
import { requireModule } from "@/lib/module-capability";
import { listBexExchanges } from "@/services/guru/bex.service";
import { listFeePolicyDiscounts } from "@/services/guru/feepolicy.service";
import { listOracleRequests } from "@/services/guru/oracle.service";

const root = resolve(import.meta.dirname, "../..");
const publicKeys = Object.keys(readPublicEnv());
const directories: string[] = [];
function fixture(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), "gura74-env-"));
  directories.push(directory);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text);
  return directory;
}
function cleanEnv(mode = "test"): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  Object.assign(env, { NODE_ENV: mode });
  for (const key of Object.keys(env)) if (key.startsWith("NEXT_PUBLIC_") || key === "__NEXT_PROCESSED_ENV") delete env[key];
  return env;
}
function load(directory: string, mode = "test", override: Record<string, string> = {}) {
  return JSON.parse(execFileSync(process.execPath, ["-e", `
    const { loadEnvConfig } = require('@next/env');
    loadEnvConfig(process.argv[1], process.env.NODE_ENV === 'development');
    console.log(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('NEXT_PUBLIC_')))));
  `, directory], { cwd: root, env: { ...cleanEnv(mode), ...override }, encoding: "utf8" })) as Record<string, string>;
}
function apply(values: Record<string, string>) {
  for (const key of publicKeys) vi.stubEnv(key, values[key]);
}
afterEach(() => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

it.each(["development", "production", "test"])("matches Next variable precedence in isolated %s process", mode => {
  const directory = fixture({
    ".env": "NEXT_PUBLIC_LCD_URL=https://base.example\nNEXT_PUBLIC_WS_URL=wss://base.example\n",
    [`.env.${mode}`]: "NEXT_PUBLIC_LCD_URL=https://mode.example\nNEXT_PUBLIC_RPC_URL=https://mode-rpc.example\n",
    ".env.local": "NEXT_PUBLIC_LCD_URL=https://local.example\nNEXT_PUBLIC_EVM_RPC_URL=https://local-evm.example\n",
    [`.env.${mode}.local`]: "NEXT_PUBLIC_LCD_URL=https://top.example\nNEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=synthetic\n",
  });
  expect(load(directory, mode)).toEqual({
    NEXT_PUBLIC_LCD_URL: "https://top.example", NEXT_PUBLIC_RPC_URL: "https://mode-rpc.example",
    NEXT_PUBLIC_WS_URL: "wss://base.example", NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "synthetic",
    ...(mode === "test" ? {} : { NEXT_PUBLIC_EVM_RPC_URL: "https://local-evm.example" }),
  });
  expect(load(directory, mode, { NEXT_PUBLIC_LCD_URL: "https://process.example" }).NEXT_PUBLIC_LCD_URL).toBe("https://process.example");
  writeFileSync(join(directory, `.env.${mode}.local`), "");
  expect(load(directory, mode).NEXT_PUBLIC_LCD_URL).toBe(mode === "test" ? "https://mode.example" : "https://local.example");
  writeFileSync(join(directory, `.env.${mode}.local`), "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=synthetic\n");
  expect(load(directory, mode).NEXT_PUBLIC_RPC_URL).toBe("https://mode-rpc.example");
  writeFileSync(join(directory, `.env.${mode}.local`), "NEXT_PUBLIC_LCD_URL=\n");
  apply(load(directory, mode));
  expect(() => getConfiguredChains()).toThrow();
});

it("loads only test defaults and never auto-loads env.example", () => {
  const directory = fixture({ ".env.test": readFileSync(join(root, ".env.test"), "utf8"), "env.example": readFileSync(join(root, "env.example"), "utf8") });
  apply(load(directory));
  expect(getConfiguredChains()).toEqual([{ key: "default", name: "Default", lcdUrl: "https://trpc.gurufin.io:1317", rpcUrl: "https://trpc.gurufin.io:26657", evmRpcUrl: "https://trpc.gurufin.io:8545", wsUrl: "wss://trpc.gurufin.io:26657/websocket", features: { bex: true, feepolicy: true, oracle: true } }]);
  expect(getDefaultChainKey()).toBe("default");
  for (const mode of ["development", "production"]) {
    apply(load(directory, mode));
    expect(() => getConfiguredChains()).toThrow("NEXT_PUBLIC_CHAINS");
  }
  const exampleOnly = fixture({ "env.example": readFileSync(join(root, "env.example"), "utf8") });
  apply(load(exampleOnly));
  expect(() => getConfiguredChains()).toThrow("NEXT_PUBLIC_CHAINS");
});

it("enables real module services from the tracked test configuration without changing other query defaults", async () => {
  apply(load(fixture({ ".env.test": readFileSync(join(root, ".env.test"), "utf8") })));
  const chain = getConfiguredChains()[0];
  for (const feature of ["bank", "staking", "governance", "distribution"] as const) {
    expect(() => requireModule(chain, `/cosmos/${feature}/v1beta1/params`)).not.toThrow();
    expect(chain.features?.[feature]).toBeUndefined();
  }
  const http = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://trpc.gurufin.io:1317");
    switch (url.pathname) {
      case "/guru/bex/v1/exchanges": return Response.json({ exchanges: [] });
      case "/guru/feepolicy/v1/discounts": return Response.json({ discounts: [] });
      case "/guru/oracle/v2/requests": return Response.json({ requests: [] });
      default: throw new Error(`Unexpected request: ${url.pathname}`);
    }
  });
  vi.stubGlobal("fetch", http);
  await expect(listBexExchanges()).resolves.toEqual([]);
  await expect(listFeePolicyDiscounts()).resolves.toEqual([]);
  await expect(listOracleRequests()).resolves.toEqual([]);
  expect(http).toHaveBeenCalledTimes(3);
});

it("accepts process-only LCD without a test file and blocks missing endpoints before HTTP", async () => {
  apply(load(fixture({}), "production", { NEXT_PUBLIC_LCD_URL: "https://lcd.example" }));
  const chain = getConfiguredChains()[0];
  expect(chain).toMatchObject({ key: "default", lcdUrl: "https://lcd.example" });
  expect(chain.rpcUrl).toBeUndefined(); expect(chain.evmRpcUrl).toBeUndefined(); expect(chain.wsUrl).toBeUndefined();
  const http = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", http);
  expect(apiClients.lcdUrl("/probe")).toBe("https://lcd.example/probe");
  expect(() => apiClients.rpcUrl("/status")).toThrow("rpcUrl");
  expect(() => apiClients.evmRpcUrl("/")).toThrow("evmRpcUrl");
  await expect(apiClients.rpcGet("/status")).rejects.toThrow("rpcUrl");
  await expect(apiClients.rpcJson("status")).rejects.toThrow("rpcUrl");
  await expect(apiClients.evmRpcGet("/")).rejects.toThrow("evmRpcUrl");
  expect(http).not.toHaveBeenCalled();
  await apiClients.lcdGet("/probe");
  expect(http).toHaveBeenCalledOnce();
});

it("uses JSON for helpers and pinned clients even when lower single-chain endpoints remain", () => {
  const directory = fixture({ ".env.test": "NEXT_PUBLIC_LCD_URL=https://single.example\nNEXT_PUBLIC_RPC_URL=https://single-rpc.example\n", ".env.test.local": "NEXT_PUBLIC_LCD_URL=https://other.example\n" });
  apply(load(directory));
  expect(getConfiguredChains()[0]).toMatchObject({ lcdUrl: "https://other.example", rpcUrl: "https://single-rpc.example" });
  const chains = [{ key: "json", name: "JSON", lcdUrl: "https://json.example", rpcUrl: "https://json-rpc.example" }];
  vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify(chains));
  expect(getConfiguredChains()).toEqual(chains);
  expect(apiClients.rpcUrl("/status")).toBe("https://json-rpc.example/status");
  apply({});
  const pinned = createQueryClient({ key: "pinned", name: "Pinned", lcdUrl: "https://pinned.example" });
  expect(pinned.lcdUrl("/probe")).toBe("https://pinned.example/probe");
  expect(() => pinned.rpcUrl("/status")).toThrow("rpcUrl");
  vi.stubEnv("NEXT_PUBLIC_LCD_URL", "invalid");
  expect(() => getConfiguredChains()).toThrow();
});

it.each(publicKeys)("rejects an explicitly empty %s without falling back", key => {
  apply({ NEXT_PUBLIC_LCD_URL: "https://lcd.example", [key]: "" });
  expect(() => getConfiguredChains()).toThrow();
});

it.each(["", "invalid", "[]", '[{"key":"x","name":"X","lcdUrl":"invalid"}]', '[{"key":"x","name":"X","lcdUrl":"https://x.example"},{"key":"x","name":"X","lcdUrl":"https://x.example"}]'])("rejects invalid JSON without fallback: %s", raw => {
  apply({ NEXT_PUBLIC_CHAINS: raw });
  expect(() => getConfiguredChains()).toThrow();
});
it("preserves every explicit known TGXN field and adds no evidence", () => {
  const chain = { key: "tgxn", name: "TGXN", lcdUrl: "https://tgxn.gurufin.io:1317", chainId: "operator-9",
    denom: "udisplay", nativeDenom: "unative", bondDenom: "ubond", rpcUrl: "https://operator.example/rpc", evidence: ["operator supplied"] };
  const raw = JSON.stringify([chain]);
  expect(parseChainConfigs(raw)).toEqual([chain]);
  apply({ NEXT_PUBLIC_CHAINS: raw });
  expect(getConfiguredChains()).toEqual([chain]);
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "missing");
  expect(() => getDefaultChainKey()).toThrow();
});

it.each([
  ["tgxn", "https://tgxn.gurufin.io:1317"], ["tgxn", "https://tgxn.gurufin.io:1317/"],
  ["other", "https://tgxn.gurufin.io:1317"], ["tgxn", "https://other.example"],
])("keeps minimal %s at %s free of inferred metadata and single-chain merging", (key, lcdUrl) => {
  const chain = { key, name: "Minimal", lcdUrl };
  const raw = JSON.stringify([chain]);
  expect(parseChainConfigs(raw)).toEqual([chain]);
  apply({ NEXT_PUBLIC_CHAINS: raw, NEXT_PUBLIC_RPC_URL: "https://ignored.example", NEXT_PUBLIC_BECH32_PREFIX: "ignored" });
  expect(getConfiguredChains()).toEqual([chain]);
});

it.each(["lcdUrl", "rpcUrl", "evmRpcUrl"])("rejects non-HTTP %s without fallback", field => {
  expect(() => parseChainConfigs(JSON.stringify([{ key: "x", name: "X", lcdUrl: "https://x.example", [field]: "ftp://x.example" }]))).toThrow("HTTP");
});

it.each(["env.example", ".env.test"])("loads the explicit TGXN comment in %s with the documented metadata", file => {
  const text = readFileSync(join(root, file), "utf8");
  const lines = text.split("\n").filter(line => line.startsWith("# NEXT_PUBLIC_CHAINS=") && line.includes('"key":"tgxn"') || line === "# NEXT_PUBLIC_DEFAULT_CHAIN_KEY=tgxn");
  apply(load(fixture({ ".env.test": lines.map(line => line.slice(2)).join("\n") })));
  const [chain] = getConfiguredChains();
  expect(chain).toEqual({ key: "tgxn", name: "TGXN", lcdUrl: "https://tgxn.gurufin.io:1317", rpcUrl: "https://tgxn.gurufin.io:26657",
    chainId: "guru_631-1", denom: "agxn", nativeDenom: "agxn", bondDenom: "agxn",
    evidence: ["W01 2026-10-20T04:43:48Z: LCD/RPC guru_631-1; native/bond agxn. Terminal observation only; browser CORS and signing unverified."], ...(file === ".env.test" ? { features: { bex: true, feepolicy: true, oracle: true } } : {}) });
  expect(getDefaultChainKey()).toBe("tgxn");
});

it.each(["defaults", "file", "process"])("initializes the actual Vitest worker with %s precedence and restores stubs", mode => {
  const fileChains = [{ key: "file", name: "File", lcdUrl: "https://file.example", rpcUrl: "https://file-rpc.example", features: { bex: false, feepolicy: true, oracle: false } }];
  const processChains = [{ key: "process", name: "Process", lcdUrl: "https://process.example", features: { bex: true, feepolicy: false, oracle: true } }];
  const directory = fixture({
    "package.json": '{"type":"module"}',
    "vitest.config.ts": readFileSync(join(root, "vitest.config.ts"), "utf8"),
    ".env.test": readFileSync(join(root, ".env.test"), "utf8"),
    ".env.local": "NEXT_PUBLIC_LCD_URL=https://must-not-load.example\nNEXT_PUBLIC_CHAINS=invalid\n",
    ...(mode !== "defaults" ? { ".env.test.local": `NEXT_PUBLIC_CHAINS='${JSON.stringify(fileChains)}'\nNEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=synthetic\n` } : {}),
  });
  symlinkSync(join(root, "node_modules"), join(directory, "node_modules"), "dir");
  symlinkSync(join(root, "src"), join(directory, "src"), "dir");
  mkdirSync(join(directory, "tests"));
  const expected = mode === "process" ? "https://process.example" : mode === "file" ? "https://file.example" : "https://trpc.gurufin.io:1317";
  writeFileSync(join(directory, "tests/worker.test.ts"), `
    import { expect, it, vi } from 'vitest';
    import { getConfiguredChains } from '@/lib/env';
    import { apiClients } from '@/services/clients';
    it('loads before imports and restores overrides', async () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(getConfiguredChains()[0].lcdUrl).toBe(${JSON.stringify(expected)});
      expect(getConfiguredChains()[0].features).toEqual(${JSON.stringify(mode === "process" ? processChains[0].features : mode === "file" ? fileChains[0].features : { bex: true, feepolicy: true, oracle: true })});
      expect(getConfiguredChains()[0].key).toBe(${JSON.stringify(mode === "defaults" ? "default" : mode)});
      expect(getConfiguredChains()[0].rpcUrl).toBe(${mode === "process" ? "undefined" : JSON.stringify(mode === "file" ? "https://file-rpc.example" : "https://trpc.gurufin.io:26657")});
      const http = vi.fn(async () => Response.json({ ok: true }));
      vi.stubGlobal('fetch', http);
      try {
        await apiClients.lcdGet('/probe');
        expect(http.mock.calls[0][0]).toBe(${JSON.stringify(expected + "/probe")});
        vi.stubEnv('NEXT_PUBLIC_LCD_URL', 'https://temporary.example');
        expect(getConfiguredChains()[0].lcdUrl).toBe(${JSON.stringify(expected)});
        vi.stubEnv('NEXT_PUBLIC_CHAINS', JSON.stringify([{ key: 'temporary', name: 'Temporary', lcdUrl: 'https://temporary.example' }]));
        expect(getConfiguredChains()[0].lcdUrl).toBe('https://temporary.example');
      } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
      expect(getConfiguredChains()[0].lcdUrl).toBe(${JSON.stringify(expected)});
    });
    it('does not leak the previous test override', () => {
      expect(getConfiguredChains()[0].lcdUrl).toBe(${JSON.stringify(expected)});
    });
  `);
  const output = execFileSync(process.execPath, [join(root, "node_modules/vitest/vitest.mjs"), "run", "--maxWorkers=1"], {
    cwd: directory, env: { ...cleanEnv(), ...(mode === "process" ? { NEXT_PUBLIC_CHAINS: JSON.stringify(processChains) } : {}) }, encoding: "utf8", timeout: 30000,
  });
  expect(output).toContain("2 passed");
}, 40000);
