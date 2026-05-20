"use client";

import type { AccountData, AminoSignResponse, StdSignDoc } from "@cosmjs/amino";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import { getOrCreateSignClient } from "@/services/wallet/walletconnect-client";

/**
 * Minimal OfflineSigner for WalletConnect wallets exposing `cosmos_signAmino`.
 */
export function createWalletConnectOfflineSigner(params: {
  topic: string;
  chainId: string;
  signerAddress: string;
  pubkey: Uint8Array;
}): OfflineSigner {
  const { topic, chainId, signerAddress, pubkey } = params;

  return {
    getAccounts: async (): Promise<readonly AccountData[]> => [
      {
        address: signerAddress,
        algo: "secp256k1",
        pubkey,
      },
    ],
    signAmino: async (signer: string, signDoc: StdSignDoc): Promise<AminoSignResponse> => {
      if (signer !== signerAddress) {
        throw new Error("Signer address mismatch");
      }
      const client = await getOrCreateSignClient();
      const result = await client.request({
        topic,
        chainId: `cosmos:${chainId}`,
        request: {
          method: "cosmos_signAmino",
          params: {
            signerAddress: signer,
            signDoc,
          },
        },
      });
      return result as AminoSignResponse;
    },
  };
}
