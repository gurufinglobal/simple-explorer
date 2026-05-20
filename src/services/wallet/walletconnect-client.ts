import type { ProposalTypes } from "@walletconnect/types";
import type { SessionTypes } from "@walletconnect/types";
import type SignClient from "@walletconnect/sign-client";
import { getSdkError } from "@walletconnect/utils";
import { readPublicEnv } from "@/lib/env";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { getNetworkSummary } from "@/services/guru/network-summary.service";

let clientPromise: Promise<SignClient> | null = null;

/** Test-only: reset singleton between Vitest cases. */
export function resetWalletConnectClientForTests(): void {
  clientPromise = null;
}

export function getWalletConnectProjectId(): string | undefined {
  return readPublicEnv().NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
}

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("WalletConnect is only available in the browser.");
  }
}

export async function getOrCreateSignClient(): Promise<SignClient> {
  assertBrowser();
  const projectId = getWalletConnectProjectId();
  if (!projectId) {
    throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not configured.");
  }

  if (!clientPromise) {
    const env = readPublicEnv();
    clientPromise = (async () => {
      const { default: SignClient } = await import("@walletconnect/sign-client");
      return SignClient.init({
        projectId,
        relayUrl: env.NEXT_PUBLIC_WALLETCONNECT_RELAY_URL,
        metadata: {
          name: "Guru Chain Explorer",
          description: "Light explorer dashboard for Guru Chain",
          url: window.location.origin,
          icons: [],
        },
      });
    })();
  }

  return clientPromise;
}

async function buildRequiredNamespaces(): Promise<ProposalTypes.RequiredNamespaces> {
  const network = await getNetworkSummary();
  const env = readPublicEnv();
  const activeChain = await getActiveChainConfig();
  const evmRef = activeChain.evmChainId ?? env.NEXT_PUBLIC_EVM_CHAIN_ID ?? "1";
  const eipChain = `eip155:${evmRef}`;
  const cosmosChain = `cosmos:${network.chainId}`;

  return {
    eip155: {
      chains: [eipChain],
      methods: ["eth_sendTransaction", "personal_sign", "eth_signTypedData_v4"],
      events: ["accountsChanged", "chainChanged"],
    },
    cosmos: {
      chains: [cosmosChain],
      methods: ["cosmos_signDirect", "cosmos_signAmino"],
      events: [],
    },
  };
}

/**
 * Starts a WalletConnect pairing. Shows `uri` as a QR code; await `approval()` for the settled session.
 */
export async function connectWalletConnectPairing(): Promise<{
  uri?: string;
  approval: () => Promise<SessionTypes.Struct>;
}> {
  const client = await getOrCreateSignClient();
  const requiredNamespaces = await buildRequiredNamespaces();
  return client.connect({ requiredNamespaces });
}

export async function disconnectWalletConnectByTopic(topic: string): Promise<void> {
  assertBrowser();
  const client = await getOrCreateSignClient();
  await client.disconnect({
    topic,
    reason: getSdkError("USER_DISCONNECTED"),
  });
}

export async function getActiveWalletConnectSession(topic: string): Promise<SessionTypes.Struct | undefined> {
  const client = await getOrCreateSignClient();
  return client.session.get(topic);
}
