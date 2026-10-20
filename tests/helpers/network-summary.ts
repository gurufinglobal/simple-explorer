import { amountResponse } from "./amounts";
import { vi } from "vitest";
import fixture from "../fixtures/network-summary.synthetic.json";
import nodeInfo from "../fixtures/tgxn-2026-10-20/node-info.json";

export { fixture };

/** Only the fetch boundary is replaced; clients, parsing and services run normally. */
export function mockNetworkSummaryHttp() {
  vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify([{
    key: "fixture", name: "Fixture", lcdUrl: "https://lcd.example.test", denom: "agxn", nativeDenom: "agxn", bondDenom: "agxn",
  }]));
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "fixture");
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const path = url.pathname;
    let body: unknown;
    if (amountResponse(url)) body = amountResponse(url);
    else if (path.endsWith("/blocks/latest")) body = fixture.latest;
    else if (/\/blocks\/[123]$/.test(path)) {
      const height = path.split("/").at(-1);
      body = { block: { header: { height, time: `2026-01-01T00:00:0${height}Z` } } };
    } else if (path.endsWith("/supply/by_denom") && url.searchParams.get("denom") === "agxn") body = fixture.supply;
    else if (path.endsWith("/pool")) body = fixture.pool;
    else if (path.endsWith("/inflation")) body = fixture.inflation;
    else if (path.endsWith("/accounts")) body = fixture.accounts;
    else if (path.endsWith("/node_info")) body = nodeInfo.response;
    else throw new Error(`Unexpected test URL: ${url}`);
    return Response.json(body);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function restoreHttpBoundary() {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
}
