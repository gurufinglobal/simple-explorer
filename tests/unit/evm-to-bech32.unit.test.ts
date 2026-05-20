import { describe, expect, it } from "vitest";
import { ethToCosmosBech32, isEthereumAddress } from "@/lib/evm-to-bech32";
import { getEffectiveCosmosAddress } from "@/lib/resolve-cosmos-address";

describe("evm to bech32", () => {
  it("detects Ethereum address", () => {
    expect(isEthereumAddress("0x0000000000000000000000000000000000000001")).toBe(true);
    expect(isEthereumAddress("guru1abc")).toBe(false);
  });

  it("encodes 20-byte address with guru prefix (Ethermint-style)", () => {
    const addr = ethToCosmosBech32("0x0000000000000000000000000000000000000001", "guru");
    expect(addr).toBe("guru1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpk053t3");
  });

  it("resolves effective cosmos from EVM only", () => {
    const cosmos = getEffectiveCosmosAddress({
      bech32Address: null,
      evmAddress: "0x0000000000000000000000000000000000000001",
    });
    expect(cosmos).toBe("guru1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpk053t3");
  });

  it("prefers explicit bech32 over EVM derivation", () => {
    const cosmos = getEffectiveCosmosAddress({
      bech32Address: "guru1explicit",
      evmAddress: "0x0000000000000000000000000000000000000001",
    });
    expect(cosmos).toBe("guru1explicit");
  });
});
