import { describe, expect, it } from "vitest";
import { ActionConfirmModal } from "@/components/staking/action-confirm-modal";

describe("action confirmation integration", () => {
  it("exports a renderable confirmation component", () => {
    expect(typeof ActionConfirmModal).toBe("function");
  });
});
