import { ethToCosmosBech32, isEthereumAddress } from "@/lib/evm-to-bech32";
import { getActiveChainConfigFromClientCookie } from "@/lib/chain-selection";
import { readPublicEnv } from "@/lib/env";

/**
 * Returns the Cosmos (bech32) address used for LCD queries.
 * If the wallet only exposes an EVM 0x address, derives the matching Ethermint-style bech32 account.
 */
export function getEffectiveCosmosAddress(input: {
  bech32Address: string | null;
  evmAddress: string | null;
}): string | null {
  if (input.bech32Address) {
    return input.bech32Address;
  }
  if (input.evmAddress && isEthereumAddress(input.evmAddress)) {
    const chain = typeof window !== "undefined" ? getActiveChainConfigFromClientCookie() : null;
    const hrp = chain?.bech32Prefix ?? readPublicEnv().NEXT_PUBLIC_BECH32_PREFIX ?? "guru";
    try {
      return ethToCosmosBech32(input.evmAddress, hrp);
    } catch {
      return null;
    }
  }
  return null;
}
