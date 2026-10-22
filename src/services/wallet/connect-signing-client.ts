import type { OfflineSigner } from "@cosmjs/proto-signing";
import { SigningStargateClient, type SigningStargateClientOptions } from "@cosmjs/stargate";
import type { ChainConfig } from "@/lib/env";
import { isGuruReleaseProfile } from "./signing-profile";

export async function connectSigningClient(chain: ChainConfig, signer: OfflineSigner, options: SigningStargateClientOptions) {
  if (isGuruReleaseProfile(chain)) {
    const { GuruSigningClient } = await import("./guru-signing-client");
    return GuruSigningClient.connectGuru(chain.rpcUrl!, signer, chain, options);
  }
  return SigningStargateClient.connectWithSigner(chain.rpcUrl!, signer, options);
}
