import { describe, expect, it } from "vitest";
import { getWalletSession } from "@/server/handlers/wallet-session.handler";

describe("wallet session contract", () => {
  it("returns status and addresses", () => {
    const result = getWalletSession();
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("status");
    expect(result.body).toHaveProperty("bech32Address");
    expect(result.body).toHaveProperty("evmAddress");
  });
});
