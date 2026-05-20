import { useMemo } from "react";
import { getEffectiveCosmosAddress } from "@/lib/resolve-cosmos-address";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

/** Cosmos bech32 address used for LCD queries (derives from EVM when only 0x is present). */
export function useEffectiveCosmosAddress(): string | null {
  const bech32Address = useWalletSessionStore((s) => s.bech32Address);
  const evmAddress = useWalletSessionStore((s) => s.evmAddress);
  return useMemo(
    () => getEffectiveCosmosAddress({ bech32Address, evmAddress }),
    [bech32Address, evmAddress],
  );
}
