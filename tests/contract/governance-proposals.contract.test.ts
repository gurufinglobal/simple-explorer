import { describe, expect, it } from "vitest";
import { listProposals, getGovParams } from "@/services/guru/governance-query.service";

describe("governance query contract (test env)", () => {
  it("returns a non-empty proposals array in NODE_ENV test", async () => {
    const list = await listProposals();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]?.id).toBeDefined();
  });

  it("returns gov params bundle in NODE_ENV test", async () => {
    const p = await getGovParams();
    expect(p.voting?.votingPeriod).toBeDefined();
    expect(p.tallying?.quorum).toBeDefined();
    expect(p.deposit?.minDeposit?.length).toBeGreaterThan(0);
  });
});
