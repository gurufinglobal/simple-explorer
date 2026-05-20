import { describe, expect, it } from "vitest";
import { getNetworkSummaryPayload } from "@/server/handlers/network-summary.handler";
import { getAccountsTotal } from "@/services/guru/network-summary.service";

describe("network summary contract", () => {
  it("returns chain metrics payload", async () => {
    const result = await getNetworkSummaryPayload();
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("chainId");
    expect(result.body).toHaveProperty("blockHeight");
    expect(result.body).toHaveProperty("averageBlockTimeSec");
    expect(result.body).toHaveProperty("supply");
    expect(result.body).toHaveProperty("inflation");
  });

  it("returns auth accounts total with safe fallback", async () => {
    const total = await getAccountsTotal();
    expect(total === null || /^[0-9]+$/.test(total)).toBe(true);
  });
});
