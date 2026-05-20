import { beforeEach, describe, expect, it } from "vitest";
import { connectWallet } from "@/services/wallet/wallet-connector";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

describe("wallet lifecycle integration", () => {
  beforeEach(() => {
    useWalletSessionStore.getState().disconnect();
  });

  it("connects then disconnects", async () => {
    const result = await connectWallet("keplr");
    useWalletSessionStore
      .getState()
      .connect(result.walletType, result.bech32Address, result.evmAddress);
    expect(useWalletSessionStore.getState().status).toBe("connected");
    useWalletSessionStore.getState().disconnect();
    expect(useWalletSessionStore.getState().status).toBe("disconnected");
  });
});
