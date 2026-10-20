import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getNetworkSummaryPayload } from "@/server/handlers/network-summary.handler";
import { getAccountsTotal, getApplicationVersions, getNetworkSummary } from "@/services/guru/network-summary.service";
import { mockNetworkSummaryHttp, restoreHttpBoundary } from "../helpers/network-summary";

let http: ReturnType<typeof mockNetworkSummaryHttp>;
beforeEach(() => { http = mockNetworkSummaryHttp(); });
afterEach(restoreHttpBoundary);

describe("network summary through the HTTP boundary", () => {
  it("transforms chain, block intervals, exact base amounts and inflation", async () => {
    expect(await getNetworkSummaryPayload()).toEqual({ status: 200, body: {
      chainId: "fixture-chain-1", blockHeight: 3, averageBlockTimeSec: 1,
      supply: "123456789.0123 gxn", bonded: "4.5 gxn", inflation: "4.20%",
    } });
    expect(http).toHaveBeenCalledTimes(7);
    expect(http).toHaveBeenCalledWith("https://lcd.example.test/cosmos/bank/v1beta1/supply/by_denom?denom=agxn", { cache: "no-store" });
  });

  it("handles normal zero amounts through the real conversion", async () => {
    const respond = http.getMockImplementation()!;
    http.mockImplementation((input, init) => {
      if (String(input).includes("/supply/")) return Promise.resolve(Response.json({ amount: { amount: "0", denom: "agxn" } }));
      if (String(input).endsWith("/pool")) return Promise.resolve(Response.json({ pool: { bonded_tokens: "0" } }));
      return respond(input, init);
    });
    expect(await getNetworkSummary()).toMatchObject({ supply: "0 gxn", bonded: "0 gxn", chainId: "fixture-chain-1" });
  });

  it("characterizes the existing partial failure fallback (W02 must distinguish it from zero)", async () => {
    const respond = http.getMockImplementation()!;
    http.mockImplementation((input, init) => String(input).endsWith("/inflation")
      ? Promise.resolve(new Response("unavailable", { status: 503 })) : respond(input, init));
    expect(await getNetworkSummary()).toMatchObject({ supply: "123456789.0123 gxn", bonded: "4.5 gxn", inflation: "0.00%" });
  });

  it.each(["http", "parse", "timeout"])("executes the existing %s fallback without test-only success", async (failure) => {
    if (failure === "http") http.mockResolvedValue(new Response("unavailable", { status: 500 }));
    if (failure === "parse") http.mockImplementation(async () => new Response("invalid-json"));
    // Upstream timeout rejection only: clients currently have no timer/AbortController.
    if (failure === "timeout") http.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    expect(await getNetworkSummary()).toEqual({
      chainId: "unknown", blockHeight: 0, averageBlockTimeSec: 0,
      supply: "0 gxn", bonded: "0 gxn", inflation: "0.00%",
    });
    expect(http).toHaveBeenCalledTimes(4);
  });

  it("preserves a total larger than Number.MAX_SAFE_INTEGER as a string", async () => {
    expect(await getAccountsTotal()).toBe("9007199254740993");
    expect(http).toHaveBeenCalledWith("https://lcd.example.test/cosmos/auth/v1beta1/accounts?pagination.limit=1&pagination.count_total=true", { cache: "no-store" });
  });

  it.each(["0", " 42 ", "not-a-number", "", undefined])("validates the raw account total %s", async (raw) => {
    http.mockResolvedValue(Response.json({ pagination: { total: raw } }));
    expect(await getAccountsTotal()).toBe(raw?.trim() && /^\d+$/.test(raw.trim()) ? raw.trim() : null);
  });

  it("returns null when account lookup fails", async () => {
    http.mockRejectedValue(new Error("offline"));
    expect(await getAccountsTotal()).toBeNull();
  });

  it("maps the captured public node version response", async () => {
    expect(await getApplicationVersions()).toEqual(expect.arrayContaining([
      { name: "network", version: "guru_631-1" },
      { name: "cosmos_sdk_version", version: "v0.53.6-guru.1" },
    ]));
    expect(http).toHaveBeenCalledTimes(1);
  });

  it("uses explicit placeholder versions on HTTP failure", async () => {
    http.mockResolvedValue(new Response("offline", { status: 503 }));
    expect(await getApplicationVersions()).toEqual([
      { name: "network", version: "-" }, { name: "app_name", version: "-" }, { name: "version", version: "-" },
    ]);
  });
});
