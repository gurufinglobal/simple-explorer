import { describe, expect, it } from "vitest";
import { sanitizeInput } from "@/lib/sanitize";

describe("accessibility audit", () => {
  it("sanitizes unsafe characters before UI reflection", () => {
    expect(sanitizeInput("<script>alert(1)</script>")).not.toContain("<");
  });
});
