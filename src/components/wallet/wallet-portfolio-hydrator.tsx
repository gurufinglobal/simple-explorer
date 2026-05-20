"use client";

import { useEffect } from "react";
import { getEffectiveCosmosAddress } from "@/lib/resolve-cosmos-address";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { useWalletPortfolioStore } from "@/stores/wallet-portfolio.store";

/**
 * Keeps wallet portfolio (LCD) in sync whenever the connected wallet address changes.
 * Mount once under explorer layout so all pages share the same portfolio state.
 */
export function WalletPortfolioHydrator() {
  const status = useWalletSessionStore((s) => s.status);
  const bech32Address = useWalletSessionStore((s) => s.bech32Address);
  const evmAddress = useWalletSessionStore((s) => s.evmAddress);
  const clear = useWalletPortfolioStore((s) => s.clear);
  const refresh = useWalletPortfolioStore((s) => s.refresh);

  useEffect(() => {
    if (status !== "connected") {
      clear();
      return;
    }
    const cosmos = getEffectiveCosmosAddress({ bech32Address, evmAddress });
    if (!cosmos) {
      clear();
      return;
    }
    void refresh(cosmos);
  }, [status, bech32Address, evmAddress, clear, refresh]);

  useEffect(() => {
    const onChainChanged = () => {
      const current = useWalletSessionStore.getState();
      if (current.status !== "connected") {
        clear();
        return;
      }
      const cosmos = getEffectiveCosmosAddress({
        bech32Address: current.bech32Address,
        evmAddress: current.evmAddress,
      });
      if (!cosmos) {
        clear();
        return;
      }
      void refresh(cosmos);
    };
    window.addEventListener("gf-chain-changed", onChainChanged);
    return () => window.removeEventListener("gf-chain-changed", onChainChanged);
  }, [clear, refresh]);

  return null;
}
