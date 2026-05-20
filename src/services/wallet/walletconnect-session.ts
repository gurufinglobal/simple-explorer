import type { SessionTypes } from "@walletconnect/types";
import { parseAccountId } from "@walletconnect/utils";
import type { WalletConnectNormalizedSession } from "@/types/walletconnect";

/**
 * Maps a WalletConnect Sign session into explorer-friendly addresses and chain ids.
 */
export function normalizeWalletConnectSession(session: SessionTypes.Struct): WalletConnectNormalizedSession {
  const topic = session.topic;
  const chains = new Set<string>();
  let evmAddress: string | null = null;
  let bech32Address: string | null = null;

  const namespaces = session.namespaces ?? {};

  const eipNs = namespaces.eip155;
  if (eipNs?.accounts?.length) {
    for (const account of eipNs.accounts) {
      const parsed = parseAccountId(account);
      if (parsed.namespace === "eip155") {
        evmAddress = parsed.address;
        chains.add(`${parsed.namespace}:${parsed.reference}`);
      }
    }
  }

  const cosmosNs = namespaces.cosmos;
  if (cosmosNs?.accounts?.length) {
    for (const account of cosmosNs.accounts) {
      const parsed = parseAccountId(account);
      if (parsed.namespace === "cosmos") {
        bech32Address = parsed.address;
        chains.add(`${parsed.namespace}:${parsed.reference}`);
      }
    }
  }

  if (eipNs?.chains?.length) {
    for (const c of eipNs.chains) {
      chains.add(c);
    }
  }
  if (cosmosNs?.chains?.length) {
    for (const c of cosmosNs.chains) {
      chains.add(c);
    }
  }

  return {
    sessionTopic: topic,
    evmAddress,
    bech32Address,
    connectedChains: [...chains],
  };
}
