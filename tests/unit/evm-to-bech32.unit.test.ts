import { afterEach, describe, expect, it, vi } from "vitest";
import { ethToCosmosBech32, isEthereumAddress } from "@/lib/evm-to-bech32";
import { getEffectiveCosmosAddress } from "@/lib/resolve-cosmos-address";

describe("evm to bech32", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("detects Ethereum address", () => {
    expect(isEthereumAddress("0x0000000000000000000000000000000000000001")).toBe(true);
    expect(isEthereumAddress("guru1abc")).toBe(false);
  });

  it("encodes 20-byte address with guru prefix (Ethermint-style)", () => {
    const addr = ethToCosmosBech32("0x0000000000000000000000000000000000000001", "guru");
    expect(addr).toBe("guru1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpk053t3");
  });

  it("does not treat a configured prefix as verified EVM mapping", () => {
    vi.stubEnv("NEXT_PUBLIC_BECH32_PREFIX", "guru");
    const cosmos = getEffectiveCosmosAddress({
      bech32Address: null,
      evmAddress: "0x0000000000000000000000000000000000000001",
    });
    expect(cosmos).toBeNull();
  });

  it("does not guess an unconfigured prefix", () => {
    vi.stubEnv("NEXT_PUBLIC_BECH32_PREFIX", undefined);
    expect(getEffectiveCosmosAddress({ bech32Address: null, evmAddress: "0x0000000000000000000000000000000000000001" })).toBeNull();
  });

  it("rejects invalid explicit bech32 instead of deriving an EVM address", () => {
    const cosmos = getEffectiveCosmosAddress({
      bech32Address: "guru1explicit",
      evmAddress: "0x0000000000000000000000000000000000000001",
    });
    expect(cosmos).toBeNull();
  });
});
