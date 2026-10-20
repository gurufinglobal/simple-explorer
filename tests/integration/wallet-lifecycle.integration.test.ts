// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectWallet } from "@/services/wallet/wallet-connector";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

describe("wallet lifecycle integration", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); delete window.keplr; delete window.getOfflineSigner; });
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify([{ key: "a", name: "A", lcdUrl: "https://lcd.test", chainId: "a-1" }]));
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "a");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ default_node_info: { network: "a-1" } })));
    window.keplr = { enable: vi.fn().mockResolvedValue(undefined) };
    window.getOfflineSigner = () => ({ getAccounts: async () => [{ address: "guru1test" }] });
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
