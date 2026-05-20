import { describe, expect, it } from "vitest";
import { classifyQuery } from "@/services/search/query-classifier";

describe("search routing integration", () => {
  it("routes block heights", () => {
    const result = classifyQuery("12345");
    expect(result.resolvedType).toBe("blockHeight");
  });
});
