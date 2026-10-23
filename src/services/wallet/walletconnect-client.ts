import { ServiceError } from "@/i18n/service-message";
import type { ProposalTypes } from "@walletconnect/types";
import type { SessionTypes } from "@walletconnect/types";
import type SignClient from "@walletconnect/sign-client";
import { getSdkError } from "@walletconnect/utils";
import { readPublicEnv, type ChainConfig } from "@/lib/env";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { verifyLcdChain } from "./chain-eligibility";

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
    throw new ServiceError("walletconnect_is_only_available_in_the_browser");
  }
}

export async function getOrCreateSignClient(): Promise<SignClient> {
  assertBrowser();
  const projectId = getWalletConnectProjectId();
  if (!projectId) {
    throw new ServiceError("next_public_walletconnect_project_id_is_not_configured");
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
    })().catch(error => { clientPromise = null; throw error; });
  }

  return clientPromise;
}

async function buildRequiredNamespaces(chain: ChainConfig): Promise<ProposalTypes.RequiredNamespaces> {
  const chainId = chain.chainId ?? await verifyLcdChain(chain);
  return { cosmos: { chains: [`cosmos:${chainId}`], methods: ["cosmos_signAmino"], events: [] } };
}

/**
 * Starts a WalletConnect pairing. Shows `uri` as a QR code; await `approval()` for the settled session.
 */
export async function connectWalletConnectPairing(chain: ChainConfig = getActiveChainConfig()): Promise<{
  uri?: string;
  approval: () => Promise<SessionTypes.Struct>;
}> {
  const client = await getOrCreateSignClient();
  const requiredNamespaces = await buildRequiredNamespaces(chain);
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
