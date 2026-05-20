import { describe, expect, it } from "vitest";
import { HeaderWalletMenu } from "@/components/wallet/header-wallet-menu";

describe("header wallet menu", () => {
  it("exports a client menu component", () => {
    expect(typeof HeaderWalletMenu).toBe("function");
  });
});
