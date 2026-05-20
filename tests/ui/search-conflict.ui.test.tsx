import { describe, expect, it } from "vitest";
import { classifyQuery } from "@/services/search/query-classifier";

describe("search conflict ui", () => {
  it("returns deterministic classifier result for search feedback", () => {
    const result = classifyQuery("1");
    expect(result).toHaveProperty("resolvedType");
  });
});
