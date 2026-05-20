import { describe, expect, it } from "vitest";
import { getStreamStatus } from "@/server/handlers/stream-status.handler";

describe("stream status contract", () => {
  it("returns ws and fallback fields", () => {
    const result = getStreamStatus();
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("wsConnected");
    expect(result.body).toHaveProperty("fallbackPolling");
  });
});
