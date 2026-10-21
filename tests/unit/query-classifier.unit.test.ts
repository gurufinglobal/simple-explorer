import { describe, expect, it } from "vitest";
import { classifyQuery } from "@/services/search/query-classifier";

describe("query classifier", () => {
  it("prioritizes tx hash over block height", () => {
    const txHash = "a".repeat(64);
    const result = classifyQuery(txHash);
    expect(result.resolvedType).toBe("txHash");
  });

  it("rejects unverified EVM address mapping", () => {
    const result = classifyQuery("0x0000000000000000000000000000000000000002");
    expect(result.error).toContain("검증되지");
  });

  it("classifies validator and token prefixes", () => {
    expect(classifyQuery("validator-1").resolvedType).toBe("validator");
    expect(classifyQuery("token:uguru").resolvedType).toBe("token");
  });

  it("rejects unknown input instead of interpreting it as a token", () => {
    const result = classifyQuery("???");
    expect(result.resolvedType).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});
