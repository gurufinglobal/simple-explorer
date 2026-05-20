import { describe, expect, it } from "vitest";
import { resolveSearch } from "@/server/handlers/search-resolve.handler";

describe("search resolve contract", () => {
  it("returns resolvedType and hasConflict", () => {
    const result = resolveSearch("1");
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("resolvedType");
    expect(result.body).toHaveProperty("hasConflict");
  });

  it("returns 400 when query is empty", () => {
    const result = resolveSearch("   ");
    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty("message");
  });

  it("returns 400 when query is undefined", () => {
    const result = resolveSearch(undefined);
    expect(result.status).toBe(400);
  });
});
