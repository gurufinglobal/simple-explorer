// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { bech32 } from "bech32";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TopNavSearch } from "@/components/search/top-nav-search";
import AddressPage from "@/app/(explorer)/address/[address]/page";
import BlockPage from "@/app/(explorer)/blocks/[height]/page";
import TxPage from "@/app/(explorer)/tx/[hash]/page";
import Home from "@/app/page";
import ChainLink from "@/components/layout/chain-link";
import { getActiveChainConfig, getChainSelectionGeneration, resolveChainContext, synchronizeRouteChain, withChain } from "@/lib/chain-selection";
import { canonicalAccountAddress } from "@/lib/canonical-address";
import { getEffectiveCosmosAddress } from "@/lib/resolve-cosmos-address";
import { classifyQuery } from "@/services/search/query-classifier";
import { lookupByQuery } from "@/server/handlers/search-lookup.handler";
import { attachWalletLifecycle } from "@/services/wallet/wallet-lifecycle";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { WalletPortfolioHydrator } from "@/components/wallet/wallet-portfolio-hydrator";
import { useWalletPortfolioStore } from "@/stores/wallet-portfolio.store";
import type { ChainConfig } from "@/lib/env";
import { lcdBytesToHex } from "@/lib/bytes";
import e08 from "../fixtures/w08/e08-lcd.json";
import rpc08 from "../fixtures/w08/e08-rpc.json";
import e09 from "../fixtures/w08/e09-tx.json";

const chains: ChainConfig[] = [
  { key: "a", name: "Guru fixture", bech32Prefix: "guru", lcdUrl: "https://a.example", chainId: "guru-fixture", bondDenom: "agxn" },
  { key: "b", name: "Cosmos fixture", bech32Prefix: "cosmos", lcdUrl: "https://b.example", chainId: "cosmos-fixture", bondDenom: "uatom" },
];
const address = (prefix: string, byte = 1) => bech32.encode(prefix, bech32.toWords(new Uint8Array(20).fill(byte)));
const push = vi.fn();
const router = { push, prefetch: vi.fn() } as unknown as AppRouterInstance;
const http = vi.fn<typeof fetch>();
function boundary(input: RequestInfo | URL): Response {
  const url = new URL(String(input));
  if (url.pathname.includes("/blocks/")) return Response.json(e08.response);
  if (url.pathname.includes("/txs/")) return Response.json(e09.response);
  if (url.pathname.includes("/txs")) return Response.json({ tx_responses: [] });
  if (url.pathname.includes("/balances/")) return Response.json({ balances: [{ denom: "agxn", amount: "12" }] });
  if (url.pathname.includes("/accounts/")) return Response.json({ account: { account_number: "1", sequence: "2" } });
  if (url.pathname.includes("denoms_metadata")) return Response.json({ metadatas: [] });
  if (url.pathname.includes("/rewards")) return Response.json({ total: [] });
  if (url.pathname.includes("/unbonding")) return Response.json({ unbonding_responses: [] });
  if (url.pathname.includes("/delegations")) return Response.json({ delegation_responses: [] });
  if (url.pathname.includes("/params")) return Response.json({ params: { bond_denom: "agxn", unbonding_time: "86400s" } });
  throw new Error("Unexpected HTTP " + url);
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify(chains));
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "a");
  vi.stubEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", undefined);
  window.history.replaceState(null, "", "/?chain=a");
  document.cookie = "gf_chain=b; path=/";
  http.mockReset().mockImplementation(async input => boundary(input)); push.mockReset();
  vi.stubGlobal("fetch", http);
});
afterEach(() => {
  cleanup(); useWalletSessionStore.getState().disconnect(); useWalletPortfolioStore.getState().clear();
  window.history.replaceState(null, "", "/"); document.cookie = "gf_chain=; path=/; max-age=0";
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
function route(params: Record<string, string>, element: React.ReactNode) {
  return <AppRouterContext.Provider value={router}><PathParamsContext.Provider value={params}>{element}</PathParamsContext.Provider></AppRouterContext.Provider>;
}

describe("W08 chain-aware search and actual service reads", () => {
  it.each(["unknown", "", "a"].flatMap(chain => [true, false].map(cookie => ({ chain, cookie }))))(
    "R1 home links preserve URL '$chain' with cookie B=$cookie", ({ chain, cookie }) => {
      vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "b");
      if (!cookie) document.cookie = "gf_chain=; path=/; max-age=0";
      window.history.replaceState(null, "", "/?chain=" + chain);
      render(route({}, <><Home /><ChainLink href="/tx/history?chain=b">Saved transaction</ChainLink></>));
      expect(screen.getByRole("link", { name: "Open Dashboard" }).getAttribute("href")).toBe("/dashboard?chain=" + chain);
      expect(screen.getByRole("link", { name: "Start Block Exploration" }).getAttribute("href")).toBe("/blocks?chain=" + chain);
      expect(screen.getByRole("link", { name: "Saved transaction" }).getAttribute("href")).toBe("/tx/history?chain=b");
      expect(http).not.toHaveBeenCalled();
    },
  );
  it.each(chains)("AC05-1 $key canonical address reaches its chain endpoint", async chain => {
    const input = address(chain.bech32Prefix!).toUpperCase();
    const result = await lookupByQuery(input, { chain: chain.key, cookieChain: chain.key === "a" ? "b" : "a" });
    expect(result.status).toBe(200);
    expect(http.mock.calls[0][0]).toBe(chain.lcdUrl + "/cosmos/bank/v1beta1/balances/" + input.toLowerCase());
  });
  it.each(["0x", "0X", ""])("AC05-2 %s hash and case normalize to the same Cosmos query", async prefix => {
    await lookupByQuery(prefix + e09.response.tx_response.txhash.toLowerCase(), { chain: "a" });
    expect(http.mock.calls[0][0]).toBe("https://a.example/cosmos/tx/v1beta1/txs/" + e09.response.tx_response.txhash);
  });
  it.each(["", " ", " 1", "1 ", "0", "-1", "1.2", "1e6", "???", "token:agxn", "validator-demo",
    address("cosmos"), address("guru").slice(0, -1) + "x", "0x" + "1".repeat(40)])("AC05-2 invalid/unsupported %s issues zero requests", async input => {
    const result = await lookupByQuery(input, { chain: "a" });
    expect([400, 422]).toContain(result.status); expect(http).not.toHaveBeenCalled();
  });
  it("blocks unknown and empty URL chain before any request or cookie fallback", async () => {
    for (const chain of ["unknown", ""]) {
      expect((await lookupByQuery("1", { chain, cookieChain: "a" })).status).toBe(400);
    }
    expect(http).not.toHaveBeenCalled();
  });
  it("AC05-3 requires candidate selection in the API, retaining huge height exactly", async () => {
    const input = "1".repeat(64);
    expect((await lookupByQuery(input)).status).toBe(409); expect(http).not.toHaveBeenCalled();
    await lookupByQuery(input, { candidate: "blockHeight" });
    expect(String(http.mock.calls[0][0])).toContain("/blocks/" + input);
    expect(classifyQuery("9007199254740993", chains[0]).normalized).toBe("9007199254740993");
  });
  it.each([TopNavSearch])("AC05-3 rendered search exposes both choices before navigation", Component => {
    render(route({}, <Component />));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1".repeat(64) } });
    fireEvent.click(screen.getByRole("button", { name: "search" }));
    expect(push).not.toHaveBeenCalled(); expect(http).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "블록 높이 (정수)" }));
    expect(push).toHaveBeenCalledWith("/blocks/" + "1".repeat(64) + "?chain=a");
  });
  it("AC05-4 URL A overrides cookie B and a new browser; server context agrees", async () => {
    expect(resolveChainContext("a", "b").key).toBe("a");
    expect(resolveChainContext("a").key).toBe("a");
    const view = render(route({ height: "19611674" }, <BlockPage />));
    await screen.findByText("LCD base64 원문: " + e08.response.block_id.hash);
    expect(http.mock.calls.every(([url]) => String(url).startsWith("https://a.example/"))).toBe(true);
    expect(screen.getByRole("link", { name: /높이 .* 보기/ }).getAttribute("href")).toContain("?chain=a");
    view.unmount(); http.mockClear(); document.cookie = "gf_chain=; path=/; max-age=0";
    render(route({ height: "19611674" }, <BlockPage />)); await screen.findByText("LCD base64 원문: " + e08.response.block_id.hash);
    expect(http.mock.calls.every(([url]) => String(url).startsWith("https://a.example/"))).toBe(true);
    expect(withChain("/tx/x?chain=b", "a")).toBe("/tx/x?chain=b");
  });
  it("AC05-5 address detail and wallet hydrator request exactly the same canonical account", async () => {
    const raw = address("guru").toUpperCase(), canonical = canonicalAccountAddress(raw, chains[0]);
    expect(getEffectiveCosmosAddress({ bech32Address: raw, evmAddress: null }, chains[0])).toBe(canonical);
    useWalletSessionStore.setState({ status: "connected", bech32Address: raw, evmAddress: null, chainKey: "a" });
    render(route({ address: raw }, <><AddressPage /><WalletPortfolioHydrator /></>));
    await screen.findByText("Address (canonical Bech32): " + canonical);
    await waitFor(() => expect(http.mock.calls.filter(([url]) => String(url).includes("/balances/")).length).toBeGreaterThanOrEqual(2));
    expect(http.mock.calls.filter(([url]) => String(url).includes("/balances/")).every(([url]) => String(url).endsWith("/" + canonical))).toBe(true);
  });
  it("invalid address detail blocks metadata/account/bank/portfolio/transaction HTTP alike", () => {
    render(route({ address: "guru1invalid" }, <AddressPage />));
    expect(screen.getByRole("alert").textContent).toContain("checksum");
    expect(http).not.toHaveBeenCalled();
  });
  it("discards a late block response when route target changes", async () => {
    let resolve!: (value: Response) => void;
    http.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const view = render(route({ height: "1" }, <BlockPage />));
    view.rerender(route({ height: "2" }, <BlockPage />));
    await screen.findByText("LCD base64 원문: " + e08.response.block_id.hash);
    await act(async () => resolve(Response.json({ ...e08.response, block: { ...e08.response.block, header: { ...e08.response.block.header, height: "1", chain_id: "STALE" } } })));
    expect(screen.queryByText("STALE")).toBeNull();
  });
  it("back/forward chain synchronization advances generation and invalidates connected wallet", () => {
    synchronizeRouteChain();
    const detach = attachWalletLifecycle();
    useWalletSessionStore.setState({ status: "connected", chainKey: "a", bech32Address: address("guru") });
    const generation = getChainSelectionGeneration();
    window.history.replaceState(null, "", "/blocks/1?chain=b"); synchronizeRouteChain();
    expect(getActiveChainConfig().key).toBe("b");
    expect(useWalletSessionStore.getState().status).toBe("disconnected");
    window.history.replaceState(null, "", "/blocks/1?chain=a"); synchronizeRouteChain();
    expect(getChainSelectionGeneration()).toBeGreaterThan(generation);
    detach();
  });
  it("AC05-6 preserves original E08 bytes and copies explicit hex and base64", async () => {
    expect(lcdBytesToHex(e08.response.block_id.hash)).toBe("CBA4D52C72B3604EBCAEB8DF3C93A2C90EBC1381769F1715A02326AFB1CA65F5");
    expect(lcdBytesToHex(e08.response.block_id.hash)).toBe(rpc08.response.result.block_id.hash);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(route({ height: "19611674" }, <BlockPage />));
    fireEvent.click(await screen.findByRole("button", { name: "블록 ID 해시 hex 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(rpc08.response.result.block_id.hash));
    fireEvent.click(screen.getByRole("button", { name: "블록 ID 해시 base64 원문 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(e08.response.block_id.hash));
    expect(screen.queryByRole("link", { name: e08.response.block_id.hash })).toBeNull();
    expect(screen.getByText("계정/valoper 주소로 변환하지 않습니다.")).toBeTruthy();
  });
  it("AC05-7 keeps E09 Cosmos height/code/fee/message and clearly marks unavailable EVM data", async () => {
    render(route({ hash: "0x" + e09.response.tx_response.txhash.toLowerCase() }, <TxPage />));
    await screen.findByText("MsgEthereumTx");
    expect(screen.getByText(/158612886367191703 agxn/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "19611783" }).getAttribute("href")).toBe("/blocks/19611783?chain=a");
    expect(screen.getByText("Success")).toBeTruthy();
    expect(screen.getByText(/EVM transaction hash 대응, receipt\/log/)).toBeTruthy();
    expect(screen.getByText("주소 정보를 추출하지 못했습니다.")).toBeTruthy();
    expect(screen.getByText("Cosmos tx hash (hex):")).toBeTruthy();
  });
});
