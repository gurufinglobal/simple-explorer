import { canonicalAccountAddress } from "@/lib/canonical-address";
import { getActiveChainConfig } from "@/lib/chain-selection";
import type { ChainConfig } from "@/lib/env";

/** Uses the same validated account identity as address details and search. */
export function getEffectiveCosmosAddress(input: {
  bech32Address: string | null;
  evmAddress: string | null;
}, chain?: ChainConfig): string | null {
  try {
    const address = input.bech32Address ?? input.evmAddress;
    return address ? canonicalAccountAddress(address, chain ?? getActiveChainConfig()) : null;
  } catch { return null; }
}
