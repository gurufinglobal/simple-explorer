import { describe, expect, it } from "vitest";
import { ValidatorsTable } from "@/components/staking/validators-table";

describe("staking validators integration", () => {
  it("exports a renderable validators table component", () => {
    expect(typeof ValidatorsTable).toBe("function");
  });
});
