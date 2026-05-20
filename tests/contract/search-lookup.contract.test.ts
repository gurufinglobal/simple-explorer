import { describe, expect, it } from "vitest";
import { lookupByQuery } from "@/server/handlers/search-lookup.handler";

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
