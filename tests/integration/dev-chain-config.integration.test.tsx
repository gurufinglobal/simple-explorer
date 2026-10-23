// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../helpers/render";
import { ChainSelector } from "@/components/layout/chain-selector";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { getConfiguredChains } from "@/lib/env";
import { apiClients } from "@/services/clients";
import { writeBlockReason } from "@/services/wallet/chain-eligibility";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

const customChains = JSON.stringify([
  { key: "first", name: "First", lcdUrl: "https://first.example:1317", rpcUrl: "https://first.example:26657" },
  { key: "saved", name: "Saved", lcdUrl: "https://saved.example:1317", rpcUrl: "https://saved.example:26657" },
]);
beforeEach(() => {
  for (const key of Object.keys(process.env).filter(key => key.startsWith("NEXT_PUBLIC_"))) vi.stubEnv(key, undefined);
  vi.stubEnv("NODE_ENV", "development");
  window.history.replaceState(null, "", "/");
  document.cookie = "gf_chain=; max-age=0; path=/";
});
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); document.cookie = "gf_chain=; max-age=0; path=/"; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("renders TGXN and sends client LCD/RPC requests to the same defaults as the server", async () => {
  render(<ChainSelector />);
  expect(screen.getByRole("combobox").textContent).toBe("TGXN");
  const chain = getActiveChainConfig();
  expect(chain).toMatchObject({ key: "tgxn", chainId: "guru_631-1", denom: "agxn", nativeDenom: "agxn", bondDenom: "agxn" });
  for (const field of ["bech32Prefix", "feeDenom", "decimals", "signing", "rpcAccess", "evmRpcUrl", "wsUrl"] as const) {
    expect(chain[field]).toBeUndefined();
  }
  expect(writeBlockReason(chain, { ...useWalletSessionStore.getState(), status: "connected", chainKey: "tgxn", chainId: "guru_631-1", walletType: "keplr" })).toContain("검증 정보가 부족");
  const http = vi.fn<typeof fetch>(async () => Response.json({ default_node_info: { network: "guru_631-1" }, application_version: { name: "synthetic" } }));
  vi.stubGlobal("fetch", http);
  await apiClients.lcdGet("/cosmos/base/tendermint/v1beta1/node_info");
  await apiClients.rpcGet("/status");
  expect(http.mock.calls.map(([url]) => url)).toEqual([
    "https://tgxn.gurufin.io:1317/cosmos/base/tendermint/v1beta1/node_info", "https://tgxn.gurufin.io:26657/status",
  ]);
});

it("honors JSON and default key overrides, then preserves a valid saved cookie", async () => {
  vi.stubEnv("NEXT_PUBLIC_CHAINS", customChains);
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "first");
  vi.stubEnv("NEXT_PUBLIC_LCD_URL", "https://ignored.example:1317");
  expect(getActiveChainConfig().key).toBe("first");
  document.cookie = "gf_chain=saved; path=/";
  render(<ChainSelector />);
  expect(screen.getByRole("combobox").textContent).toBe("Saved");
  const http = vi.fn<typeof fetch>(async () => Response.json({ default_node_info: { network: "guru_631-1" }, application_version: { name: "synthetic" } }));
  vi.stubGlobal("fetch", http);
  await apiClients.lcdGet("/probe");
  await apiClients.rpcGet("/status");
  expect(http.mock.calls.map(([url]) => url)).toEqual(["https://saved.example:1317/probe", "https://saved.example:26657/status"]);
  expect(document.cookie).toContain("gf_chain=saved");
});

it.each(["default", "missing", "%E0%A4%A"])("preserves invalid cookie %s until explicit TGXN selection", cookie => {
  document.cookie = `gf_chain=${cookie}; path=/`;
  render(<ChainSelector />);
  expect(screen.getByRole("alert").textContent).toContain("다시 선택");
  expect(() => getActiveChainConfig()).toThrow();
  expect(document.cookie).toContain(`gf_chain=${cookie}`);
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "TGXN" }));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(getActiveChainConfig().key).toBe("tgxn");
  expect(document.cookie).toContain("gf_chain=tgxn");
});

it.each(["{broken", "", "[]", '[{"key":"bad","name":"Bad","lcdUrl":"invalid"}]',
  '[{"key":"x","name":"X","lcdUrl":"https://x.example"},{"key":"x","name":"X","lcdUrl":"https://x.example"}]',
])("does not hide invalid chain configuration %s behind the dev preset", raw => {
  vi.stubEnv("NEXT_PUBLIC_CHAINS", raw);
  expect(() => getConfiguredChains()).toThrow();
  render(<ChainSelector />);
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText("TGXN")).toBeNull();
});

it("rejects an unknown default key and an invalid individual endpoint", () => {
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "missing");
  expect(() => getActiveChainConfig()).toThrow("기본 체인 key");
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", undefined);
  vi.stubEnv("NEXT_PUBLIC_LCD_URL", "invalid");
  expect(() => getActiveChainConfig()).toThrow();
});
