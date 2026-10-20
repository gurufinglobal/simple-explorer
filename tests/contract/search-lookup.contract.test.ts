import { mockQueryHttp, block, transaction } from "../helpers/query-http";
import { restoreHttpBoundary } from "../helpers/network-summary";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lookupByQuery } from "@/server/handlers/search-lookup.handler";

beforeEach(() => {
  mockQueryHttp(url => {
    if (url.pathname.includes('/balances/')) return { balances: [{ denom: 'agxn', amount: '0' }] };
    if (url.pathname.includes('/blocks/')) return { ...block(), block: { ...block().block, header: { ...block().block.header, height: '12345' } } };
    if (url.pathname.includes('/txs/')) return transaction;
    throw new Error(`Unexpected URL ${url}`);
  });
});
afterEach(restoreHttpBoundary);
describe("search lookup contract", () => {
  it("returns tx detail for tx hash", async () => {
    const result = await lookupByQuery("a".repeat(64));
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("resolvedType", "txHash");
  });

  it("returns address balances for address input", async () => {
    const result = await lookupByQuery("0x0000000000000000000000000000000000000002");
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("resolvedType", "address");
  });

  it("returns block detail for block height input", async () => {
    const result = await lookupByQuery("12345");
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("resolvedType", "blockHeight");
  });

  it("returns 422 for unsupported type", async () => {
    const result = await lookupByQuery("validator-demo");
    expect(result.status).toBe(422);
    expect(result.body).toHaveProperty("message");
  });
});
