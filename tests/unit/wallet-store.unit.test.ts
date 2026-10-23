import { beforeEach, describe, expect, it } from "vitest";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

describe("wallet session store", () => {
  beforeEach(() => {
    useWalletSessionStore.getState().disconnect();
  });

  it("connects and disconnects", () => {
    useWalletSessionStore.getState().connect("keplr", "guru1abc", "0x1");
    expect(useWalletSessionStore.getState().status).toBe("connected");
    useWalletSessionStore.getState().disconnect();
    expect(useWalletSessionStore.getState().status).toBe("disconnected");
  });

  it("supports connect without evm and explicit error state", () => {
    useWalletSessionStore.getState().connect("keplr", "guru1only", null);
    expect(useWalletSessionStore.getState().evmAddress).toBeNull();
    useWalletSessionStore.getState().setError();
    expect(useWalletSessionStore.getState().status).toBe("error");
  });

  it("supports startConnecting, meta on connect, WalletConnect apply, and setError message", () => {
    useWalletSessionStore.getState().startConnecting();
    expect(useWalletSessionStore.getState().status).toBe("connecting");

    useWalletSessionStore.getState().connect("metamask", null, "0xabc", {
      capabilities: {}, sessionTopic: "topic-1",
      connectedChains: ["eip155:1"],
    });
    expect(useWalletSessionStore.getState().sessionTopic).toBe("topic-1");
    expect(useWalletSessionStore.getState().connectedChains).toEqual(["eip155:1"]);

    useWalletSessionStore.getState().applyWalletConnectNormalized({
      capabilities: {}, sessionTopic: "wc-topic",
      evmAddress: "0x1",
      bech32Address: "guru1x",
      connectedChains: ["cosmos:x"],
    });
    expect(useWalletSessionStore.getState().walletType).toBe("walletconnect");
    expect(useWalletSessionStore.getState().bech32Address).toBe("guru1x");

    useWalletSessionStore.getState().setError("failed");
    expect(useWalletSessionStore.getState().lastError).toBe("failed");
  });
});
