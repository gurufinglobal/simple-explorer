import { describe, expect, it } from "vitest";
import { requestFaucet } from "@/server/handlers/faucet-request.handler";

describe("faucet rate limit feedback", () => {
  it("returns rejection message on repeated request", () => {
    const address = "guru1xyz0000000000000000000000000000000000";
    requestFaucet(address);
    const second = requestFaucet(address);
    expect(second.status).toBe(429);
    if ("message" in second.body) {
      expect(second.body.message).toContain("24시간");
    }
  });
});
