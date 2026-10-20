import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDenomsMetadata } from "@/services/guru/token-metadata.service";
import observed from "../fixtures/tgxn-2026-10-20/metadata.json";
import { restoreHttpBoundary } from "../helpers/network-summary";

const http = vi.fn<typeof fetch>();
beforeEach(() => {
  http.mockReset();
  vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify([{ key: "fixture", name: "Fixture", lcdUrl: "https://lcd.example.test" }]));
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "fixture");
  vi.stubGlobal("fetch", http);
});
afterEach(restoreHttpBoundary);

describe("denom metadata HTTP contract", () => {
  it("normalizes native GXN from the captured response and follows an encoded cursor", async () => {
    // The recorded first-page response is retained; only its cursor is synthetic.
    http.mockResolvedValueOnce(Response.json({ ...observed.response, pagination: { next_key: "a+/=" } }))
      .mockResolvedValueOnce(Response.json({ metadatas: [], pagination: { next_key: null } }));
    const metadata = await getDenomsMetadata();
    expect(metadata).toHaveLength(10);
    expect(metadata).toContainEqual({ baseDenom: "agxn", displayDenom: "gxn", name: "Guru Token", symbol: "GXN", description: "Guru Token", decimals: 18 });
    expect(http).toHaveBeenNthCalledWith(2, "https://lcd.example.test/cosmos/bank/v1beta1/denoms_metadata?pagination.limit=200&pagination.key=a%2B%2F%3D", { cache: "no-store" });
  });

  it("filters rows without a base denom and supports an empty successful page", async () => {
    http.mockResolvedValueOnce(Response.json({ metadatas: [{ symbol: "missing base" }] }))
      .mockResolvedValueOnce(Response.json({ metadatas: [], pagination: { next_key: null } }));
    expect(await getDenomsMetadata()).toEqual([]);
    expect(await getDenomsMetadata()).toEqual([]);
  });

  it("characterizes loss of earlier pages on a later HTTP failure for W02", async () => {
    http.mockResolvedValueOnce(Response.json({ ...observed.response, pagination: { next_key: "next" } }))
      .mockResolvedValueOnce(new Response("offline", { status: 503 }));
    expect(await getDenomsMetadata()).toEqual([]);
    expect(http).toHaveBeenCalledTimes(2);
  });

  it.each(["parse", "timeout"])("runs the existing %s fallback through the service", async (failure) => {
    if (failure === "parse") http.mockResolvedValue(new Response("not JSON"));
    else http.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    expect(await getDenomsMetadata()).toEqual([]);
    expect(http).toHaveBeenCalledTimes(1);
  });
});
