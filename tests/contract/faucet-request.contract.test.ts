import { describe, expect, it } from "vitest";
import { requestFaucet } from "@/server/handlers/faucet-request.handler";

describe("faucet request contract", () => {
  it("uses onchain_history source", () => {
    const result = requestFaucet("guru1abc0000000000000000000000000000000000");
    expect([200, 429]).toContain(result.status);
    expect(result.body).toHaveProperty("rateLimitSource", "onchain_history");
  });

  it("returns 400 when address is empty", () => {
    const result = requestFaucet(" ");
    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty("message");
  });
});
