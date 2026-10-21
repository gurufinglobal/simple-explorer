import { getEffectiveCosmosAddress } from "@/lib/resolve-cosmos-address";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

/** Cosmos bech32 address used for LCD queries (validated for the active chain; unverified EVM mapping is unsupported). */
export function useEffectiveCosmosAddress(): string | null {
  const bech32Address = useWalletSessionStore((s) => s.bech32Address);
  const evmAddress = useWalletSessionStore((s) => s.evmAddress);
  return getEffectiveCosmosAddress({ bech32Address, evmAddress });
}
