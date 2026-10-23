// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../helpers/render";
import { ChainSelector } from "@/components/layout/chain-selector";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { apiClients } from "@/services/clients";

beforeEach(() => {
  for (const key of Object.keys(process.env).filter(key => key.startsWith("NEXT_PUBLIC_"))) vi.stubEnv(key, undefined);
  vi.stubEnv("NEXT_PUBLIC_LCD_URL", "https://default.example");
  vi.stubEnv("NEXT_PUBLIC_RPC_URL", "https://default-rpc.example");
  window.history.replaceState(null, "", "/blocks?keep=1#latest");
  document.cookie = "gf_chain=; max-age=0; path=/";
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  document.cookie = "gf_chain=; max-age=0; path=/";
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each(["ko", "en"] as const)("chain selector in %s", locale => {
  it.each(["url", "cookie"])("shows the missing %s chain and recovers only after selecting Default", async source => {
    if (source === "url") {
      window.history.replaceState(null, "", "/blocks?keep=1&chain=tgxn#latest");
      document.cookie = "gf_chain=default; path=/";
    } else {
      document.cookie = "gf_chain=tgxn; path=/";
    }
    const originalUrl = window.location.href, originalCookie = document.cookie;
    const http = vi.fn<typeof fetch>(async () => Response.json({ default_node_info: { network: "fixture-1" }, application_version: { name: "synthetic" } }));
    vi.stubGlobal("fetch", http);
    render(<ChainSelector id="test-chain" />, { locale });

    const message = locale === "ko"
      ? "선택 체인 'tgxn' 설정이 없습니다. 체인을 다시 선택하세요."
      : "Configuration for selected chain 'tgxn' is missing. Select a chain again.";
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(screen.getByRole("alert").textContent).not.toContain("{value0}");
    expect(screen.getByRole("combobox").textContent).not.toContain("Default");
    expect(() => getActiveChainConfig()).toThrow("선택 체인 'tgxn' 설정이 없습니다.");
    await expect(apiClients.lcdGet("/probe")).rejects.toThrow("'tgxn'");
    await expect(apiClients.rpcGet("/status")).rejects.toThrow("'tgxn'");
    expect(http).not.toHaveBeenCalled();
    expect(window.location.href).toBe(originalUrl);
    expect(document.cookie).toBe(originalCookie);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Default" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("combobox").textContent).toBe("Default");
    expect(getActiveChainConfig().key).toBe("default");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/blocks?keep=1&chain=default#latest");
    expect(document.cookie).toContain("gf_chain=default");
    await apiClients.lcdGet("/probe");
    await apiClients.rpcGet("/status");
    expect(http.mock.calls.map(([url]) => url)).toEqual([
      "https://default.example/probe", "https://default-rpc.example/status",
    ]);
  });
});

it.each([
  ["first", "saved", "first", "First"],
  ["first", "tgxn", "first", "First"],
  [null, "saved", "saved", "Saved"],
  [null, null, "first", "First"],
])("preserves URL %s > cookie %s > configured default", (url, cookie, expectedKey, expectedLabel) => {
  vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify([
    { key: "first", name: "First", lcdUrl: "https://first.example" },
    { key: "saved", name: "Saved", lcdUrl: "https://saved.example" },
  ]));
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "first");
  if (url !== null) window.history.replaceState(null, "", `/?chain=${url}`);
  if (cookie !== null) document.cookie = `gf_chain=${cookie}; path=/`;
  render(<ChainSelector id="test-chain" />);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("combobox").textContent).toBe(expectedLabel);
  expect(getActiveChainConfig().key).toBe(expectedKey);
});
