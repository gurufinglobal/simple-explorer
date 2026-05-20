import { describe, expect, it } from "vitest";
import { normalizeGovV1Proposal, tallyPercentages } from "@/lib/gov-mapper";
import type { GovTally } from "@/lib/gov-types";

describe("normalizeGovV1Proposal", () => {
  it("maps v1 LCD proposal fields", () => {
    const p = normalizeGovV1Proposal({
      id: "3",
      status: "PROPOSAL_STATUS_VOTING_PERIOD",
      title: "Hello",
      summary: "World",
      submit_time: "2026-01-01T00:00:00Z",
      deposit_end_time: "2026-01-02T00:00:00Z",
      voting_start_time: "2026-01-02T00:00:00Z",
      voting_end_time: "2026-01-09T00:00:00Z",
      total_deposit: [{ denom: "agxn", amount: "1000" }],
      final_tally_result: {
        yes_count: "10",
        abstain_count: "0",
        no_count: "5",
        no_with_veto_count: "0",
      },
    });
    expect(p.id).toBe("3");
    expect(p.status).toBe("voting_period");
    expect(p.title).toBe("Hello");
    expect(p.finalTally.yes).toBe("10");
  });
});

describe("tallyPercentages", () => {
  it("returns zeros when no votes", () => {
    const t: GovTally = { yes: "0", abstain: "0", no: "0", noWithVeto: "0" };
    expect(tallyPercentages(t)).toEqual({ yes: 0, abstain: 0, no: 0, veto: 0 });
  });

  it("splits percentages", () => {
    const t: GovTally = { yes: "50", abstain: "0", no: "50", noWithVeto: "0" };
    const p = tallyPercentages(t);
    expect(p.yes).toBe(50);
    expect(p.no).toBe(50);
  });
});
