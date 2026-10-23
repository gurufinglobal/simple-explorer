"use client";
import { ServiceError } from "@/i18n/service-message";


import type { AccountData, AminoSignResponse, StdSignDoc } from "@cosmjs/amino";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import { assertWalletConnectApproval } from "./walletconnect-session";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { getOrCreateSignClient } from "@/services/wallet/walletconnect-client";

/**
 * Minimal OfflineSigner for WalletConnect wallets exposing `cosmos_signAmino`.
 */
export function createWalletConnectOfflineSigner(params: {
  topic: string;
  chainId: string;
  signerAddress: string;
  pubkey: Uint8Array;
  assertCurrent: () => void;
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
      params.assertCurrent();
      if (signer !== signerAddress || signDoc.chain_id !== chainId || !pubkey.length) {
        throw new ServiceError("signer_address_mismatch");
      }
      const client = await getOrCreateSignClient();
      params.assertCurrent();
      const chain = getActiveChainConfig();
      if (chain.chainId !== chainId) throw new ServiceError("walletconnect_chain_mismatch");
      assertWalletConnectApproval(client.session.get(topic), chain, signerAddress);
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
      params.assertCurrent();
      return result as AminoSignResponse;
    },
  };
}
