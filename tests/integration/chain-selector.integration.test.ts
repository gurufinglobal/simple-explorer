import { describe, expect, it } from "vitest";
import { ChainSelector } from "@/components/layout/chain-selector";

describe("chain selector integration", () => {
  it("exports a renderable chain selector component", () => {
    expect(typeof ChainSelector).toBe("function");
  });
});
