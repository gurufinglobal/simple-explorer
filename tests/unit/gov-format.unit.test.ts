import { describe, expect, it } from "vitest";
import { formatGovDurationLabel, formatGovRatioPercent } from "@/lib/gov-format";

describe("formatGovRatioPercent", () => {
  it("converts decimal string to percent", () => {
    expect(formatGovRatioPercent("0.334")).toBe("33.40%");
  });

  it("passes through invalid numbers", () => {
    expect(formatGovRatioPercent("n/a")).toBe("n/a");
  });
});

describe("formatGovDurationLabel", () => {
  it("annotates seconds", () => {
    expect(formatGovDurationLabel("432000s")).toContain("5.0일");
  });

  it("passes through non-second formats", () => {
    expect(formatGovDurationLabel("120h")).toBe("120h");
  });
});
