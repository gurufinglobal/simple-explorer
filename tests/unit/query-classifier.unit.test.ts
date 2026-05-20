import { describe, expect, it } from "vitest";
import { classifyQuery } from "@/services/search/query-classifier";

describe("query classifier", () => {
  it("prioritizes tx hash over block height", () => {
    const txHash = "a".repeat(64);
    const result = classifyQuery(txHash);
    expect(result.resolvedType).toBe("txHash");
  });

  it("classifies address", () => {
    const result = classifyQuery("0x0000000000000000000000000000000000000002");
    expect(result.resolvedType).toBe("address");
  });

  it("classifies validator and token prefixes", () => {
    expect(classifyQuery("validator-1").resolvedType).toBe("validator");
    expect(classifyQuery("token:uguru").resolvedType).toBe("token");
  });

  it("falls back to token when pattern is unknown", () => {
    const result = classifyQuery("???");
    expect(result.resolvedType).toBe("token");
    expect(result.candidates).toEqual(["token"]);
  });
});
