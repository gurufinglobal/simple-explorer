import { describe, expect, it } from "vitest";
import { formatRelativeFutureOrPast, formatRelativePastFromIso } from "@/lib/relative-time";

describe("formatRelativePastFromIso", () => {
  it("formats seconds", () => {
    const now = Date.parse("2026-01-01T12:00:10.000Z");
    expect(formatRelativePastFromIso("2026-01-01T12:00:05.000Z", now)).toBe("5초 전");
  });

  it("formats minutes", () => {
    const now = Date.parse("2026-01-01T12:10:00.000Z");
    expect(formatRelativePastFromIso("2026-01-01T12:05:00.000Z", now)).toBe("5분 전");
  });

  it("returns em dash for invalid iso", () => {
    expect(formatRelativePastFromIso("not-a-date", Date.now())).toBe("—");
  });
});

describe("formatRelativeFutureOrPast", () => {
  it("formats future as 후", () => {
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    expect(formatRelativeFutureOrPast("2026-01-01T12:00:45.000Z", now)).toBe("45초 후");
  });

  it("delegates to past formatter when time is in the past", () => {
    const now = Date.parse("2026-01-01T12:00:10.000Z");
    expect(formatRelativeFutureOrPast("2026-01-01T12:00:05.000Z", now)).toBe("5초 전");
  });
});
