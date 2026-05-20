import { describe, expect, it } from "vitest";
import { WalletConnectPanel } from "@/components/wallet/wallet-connect-panel";

describe("network summary ui", () => {
  it("provides wallet panel component", () => {
    expect(typeof WalletConnectPanel).toBe("function");
  });
});
