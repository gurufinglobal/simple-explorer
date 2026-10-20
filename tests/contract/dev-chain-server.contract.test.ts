import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfiguredChains, getDefaultChainKey, readPublicEnv } from "@/lib/env";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { apiClients } from "@/services/clients";

beforeEach(() => {
  for (const key of Object.keys(process.env).filter(key => key.startsWith("NEXT_PUBLIC_"))) vi.stubEnv(key, undefined);
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("server development configuration", () => {
  it("uses TGXN through the real selection and HTTP clients without browser globals", async () => {
    expect(typeof document).toBe("undefined");
    expect(getDefaultChainKey()).toBe("tgxn");
    expect(getActiveChainConfig()).toMatchObject({ key: "tgxn", name: "TGXN", chainId: "guru_631-1", nativeDenom: "agxn", bondDenom: "agxn" });
    const http = vi.fn<typeof fetch>(async () => Response.json({ default_node_info: { network: "guru_631-1" }, application_version: { name: "synthetic" } }));
    vi.stubGlobal("fetch", http);
    await apiClients.lcdGet("/cosmos/base/tendermint/v1beta1/node_info");
    await apiClients.rpcGet("/status");
    expect(http.mock.calls.map(([url]) => url)).toEqual([
      "https://tgxn.gurufin.io:1317/cosmos/base/tendermint/v1beta1/node_info", "https://tgxn.gurufin.io:26657/status",
    ]);
    expect(apiClients.lcdUrl("/probe")).toBe("https://tgxn.gurufin.io:1317/probe");
    expect(apiClients.rpcUrl("/status")).toBe("https://tgxn.gurufin.io:26657/status");
    await expect(apiClients.evmRpcGet("/")).rejects.toThrow("evmRpcUrl");
    expect(http).toHaveBeenCalledTimes(2);
  });

  it.each(["production", "test"])("preserves legacy defaults in %s", mode => {
    vi.stubEnv("NODE_ENV", mode);
    expect(getDefaultChainKey()).toBe("default");
    expect(getConfiguredChains()).toEqual([{
      key: "default", name: "Default", lcdUrl: "https://trpc.gurufin.io:1317", rpcUrl: "https://trpc.gurufin.io:26657",
      evmRpcUrl: "https://trpc.gurufin.io:8545", wsUrl: "wss://trpc.gurufin.io:26657/websocket",
      evmChainId: undefined, bech32Prefix: undefined,
    }]);
  });

  it.each([
    ["NEXT_PUBLIC_LCD_URL", "https://custom.example:1317", "lcdUrl"],
    ["NEXT_PUBLIC_RPC_URL", "https://custom.example:26657", "rpcUrl"],
    ["NEXT_PUBLIC_EVM_RPC_URL", "https://custom.example:8545", "evmRpcUrl"],
    ["NEXT_PUBLIC_WS_URL", "wss://custom.example/websocket", "wsUrl"],
    ["NEXT_PUBLIC_EVM_CHAIN_ID", "123", "evmChainId"],
    ["NEXT_PUBLIC_BECH32_PREFIX", "custom", "bech32Prefix"],
  ])("respects the existing single-chain override %s", (variable, value, field) => {
    vi.stubEnv(variable, value);
    expect(getDefaultChainKey()).toBe("default");
    expect(getActiveChainConfig()).toMatchObject({ [field]: value });
    expect(getActiveChainConfig().chainId).toBeUndefined();
    expect(readPublicEnv().NEXT_PUBLIC_CHAINS).toBeUndefined();
  });

  it("keeps the preset with wallet project settings or explicit tgxn default key", () => {
    vi.stubEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "synthetic-project");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "tgxn");
    expect(getDefaultChainKey()).toBe("tgxn");
  });

  it("loads .env.local and process overrides through Next's actual loader", () => {
    const directory = mkdtempSync(join(tmpdir(), "gura-40-env-"));
    const json = '[{"key":"local","name":"Local","lcdUrl":"https://local.example:1317"}]';
    try {
      writeFileSync(join(directory, ".env.local"), `NEXT_PUBLIC_CHAINS='${json}'\nNEXT_PUBLIC_DEFAULT_CHAIN_KEY=local\n`);
      const script = `const { loadEnvConfig } = require('@next/env'); loadEnvConfig(process.argv[1], true); console.log(JSON.stringify({ chains: process.env.NEXT_PUBLIC_CHAINS, key: process.env.NEXT_PUBLIC_DEFAULT_CHAIN_KEY }));`;
      const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development" };
      delete env.__NEXT_PROCESSED_ENV;
      delete env.NEXT_PUBLIC_CHAINS;
      delete env.NEXT_PUBLIC_DEFAULT_CHAIN_KEY;
      const loaded = JSON.parse(execFileSync(process.execPath, ["-e", script, directory], { env, encoding: "utf8" }));
      expect(loaded).toEqual({ chains: json, key: "local" });
      vi.stubEnv("NEXT_PUBLIC_CHAINS", loaded.chains);
      vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", loaded.key);
      expect(getActiveChainConfig().lcdUrl).toBe("https://local.example:1317");
      const overridden = JSON.parse(execFileSync(process.execPath, ["-e", script, directory], {
        env: { ...env, NEXT_PUBLIC_DEFAULT_CHAIN_KEY: "process-wins" }, encoding: "utf8",
      }));
      expect(overridden.key).toBe("process-wins");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
