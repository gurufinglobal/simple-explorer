import { describe, expect, it } from "vitest";
import { ValidatorDetailView } from "@/components/staking/validator-detail-view";

describe("staking validator detail integration", () => {
  it("exports a renderable validator detail view component", () => {
    expect(typeof ValidatorDetailView).toBe("function");
  });
});
