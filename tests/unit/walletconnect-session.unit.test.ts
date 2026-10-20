import { describe, expect, it } from "vitest";
import { normalizeWalletConnectSession } from "@/services/wallet/walletconnect-session";

describe("normalizeWalletConnectSession", () => {
  it("extracts EVM and Cosmos addresses from namespaces", () => {
    const session = {
      topic: "abc123",
      pairingTopic: "p1",
      relay: { protocol: "irn" },
      expiry: 9999999999,
      acknowledged: true,
      controller: "x",
      namespaces: {
        eip155: {
          chains: ["eip155:1"],
          accounts: ["eip155:1:0x1111111111111111111111111111111111111111"],
          methods: [],
          events: [],
        },
        cosmos: {
          chains: ["cosmos:test-chain-1"],
          accounts: ["cosmos:test-chain-1:guru1testaddress000000000000000000000"],
          methods: [],
          events: [],
        },
      },
      requiredNamespaces: {},
      optionalNamespaces: {},
      self: { publicKey: "a", metadata: { name: "", description: "", url: "", icons: [] } },
      peer: { publicKey: "b", metadata: { name: "", description: "", url: "", icons: [] } },
    };

    const n = normalizeWalletConnectSession(session as never, { key: "test", name: "Test", lcdUrl: "https://lcd.test", chainId: "test-chain-1", evmChainId: "1" });
    expect(n.sessionTopic).toBe("abc123");
    expect(n.evmAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(n.bech32Address).toBe("guru1testaddress000000000000000000000");
    expect(n.connectedChains).toContain("eip155:1");
    expect(n.connectedChains).toContain("cosmos:test-chain-1");
  });

  it("handles EVM-only session and empty namespaces", () => {
    const evmOnly = {
      topic: "t2",
      namespaces: {
        eip155: {
          chains: ["eip155:5"],
          accounts: ["eip155:5:0x2222222222222222222222222222222222222222"],
          methods: [],
          events: [],
        },
      },
    };
    const n1 = normalizeWalletConnectSession(evmOnly as never, { key: "test", name: "Test", lcdUrl: "https://lcd.test", evmChainId: "5" });
    expect(n1.bech32Address).toBeNull();
    expect(n1.evmAddress).toMatch(/^0x/);

    const emptyNs = { topic: "t3", namespaces: {} };
    const n2 = normalizeWalletConnectSession(emptyNs as never);
    expect(n2.evmAddress).toBeNull();
    expect(n2.bech32Address).toBeNull();
    expect(n2.connectedChains).toEqual([]);
  });
});
