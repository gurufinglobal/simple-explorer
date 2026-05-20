import { describe, expect, it } from "vitest";
import { GovernanceNewProposalForm } from "@/components/governance/governance-new-proposal-form";
import { GovernanceProposalDetail } from "@/components/governance/governance-proposal-detail";
import { GovernanceProposalsList } from "@/components/governance/governance-proposals-list";

describe("governance components integration", () => {
  it("exports list and detail components", () => {
    expect(typeof GovernanceProposalsList).toBe("function");
    expect(typeof GovernanceProposalDetail).toBe("function");
    expect(typeof GovernanceNewProposalForm).toBe("function");
  });
});
