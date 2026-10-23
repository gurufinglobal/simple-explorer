"use client";
import { ServiceError } from '@/i18n/service-message';

import { type GasPrice } from "@cosmjs/stargate";
import { connectSigningClient } from "./connect-signing-client";
import type { StdFee } from "@cosmjs/amino";
import { isOfflineDirectSigner, type EncodeObject, type OfflineSigner } from "@cosmjs/proto-signing";
import { AuthInfo, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { sha256 } from "@cosmjs/crypto";
import { bech32 } from "bech32";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { useWalletSessionStore as store, type WalletConnectorKind } from "@/stores/wallet-session.store";
import { verifyChainEndpoints, writeBlockReason } from "./chain-eligibility";
import { createWalletConnectOfflineSigner } from "./walletconnect-cosmos-signer";
import { assertWalletConnectApproval } from "./walletconnect-session";
import { getActiveWalletConnectSession } from "./walletconnect-client";
import { createQueryClient } from "@/services/clients";
import { cosmosKeplrSigner, getKeplrSigner } from "./keplr";
import { assertCosmosWalletKey, signingAccountParser } from "./signing-profile";

export type SigningInput = { walletType: WalletConnectorKind; sessionTopic: string | null; bech32Address: string | null };
export type SigningGuard = {
  assertCurrent: () => void;
  beforeSign?: () => Promise<void>;
  allowedSigning?: readonly { wallet: string; method: string }[];
  onBroadcast?: (hash: string) => void;
};
export async function createBoundSigningClient(params: SigningInput, gasPrice: GasPrice, guard?: SigningGuard) {
  const chain = getActiveChainConfig();
  const state = store.getState();
  const assertCurrent = () => {
    guard?.assertCurrent();
    const now = store.getState();
    if (now.generation !== state.generation || now.status !== "connected" || getActiveChainConfig().key !== chain.key ||
      now.bech32Address !== params.bech32Address || now.walletType !== params.walletType || now.sessionTopic !== params.sessionTopic) {
      throw new ServiceError("chain_wallet_or_account_changed_reconnect_and_review_the_transaction");
    }
  };
  assertCurrent();
  const reason = writeBlockReason(chain, state);
  if (reason) throw new Error(reason);
  if (gasPrice.denom !== chain.feeDenom) throw new ServiceError("fee_denom_differs_from_the_verified_chain_configuration");
  const address = state.bech32Address!;
  if (bech32.decode(address).prefix !== chain.bech32Prefix) throw new ServiceError("account_prefix_differs_from_the_selected_chain");
  await verifyChainEndpoints(chain);
  assertCurrent();
  let signer: OfflineSigner;
  if (params.walletType === "keplr") {
    signer = cosmosKeplrSigner(await getKeplrSigner(chain, assertCurrent), chain, assertCurrent);
  } else {
    const session = await getActiveWalletConnectSession(state.sessionTopic!);
    assertCurrent();
    if (!session) throw new ServiceError("walletconnect_session_missing_reconnect");
    assertWalletConnectApproval(session, chain, address);
    signer = createWalletConnectOfflineSigner({ topic: state.sessionTopic!, chainId: chain.chainId!, signerAddress: address, pubkey: state.pubkey!, assertCurrent });
  }
  const getAccounts = async () => {
    assertCurrent();
    const accounts = await signer.getAccounts();
    assertCurrent();
    const account = accounts.find(a => a.address === address);
    if (!account || !account.pubkey?.length || !state.pubkey || account.pubkey.length !== state.pubkey.length || account.pubkey.some((v, i) => v !== state.pubkey![i])) {
      throw new ServiceError("actual_signer_account_or_public_key_differs_from_the_connected");
    }
    assertCosmosWalletKey(chain, account.address, account.pubkey, account.algo);
    return accounts;
  };
  await getAccounts();
  const signingMethod = isOfflineDirectSigner(signer) ? "direct" : "amino";
  if (!chain.signingProfile!.signModes.includes(signingMethod)) throw new ServiceError("the_chain_profile_does_not_permit_the_actual_signing_method");
  if (!chain.signing?.some(s => s.wallet === state.walletType && s.method === signingMethod)) throw new ServiceError("actual_signing_method_differs_from_the_verified_method");
  if (guard?.allowedSigning && !guard.allowedSigning.some(s => s.wallet === state.walletType && s.method === signingMethod)) throw new ServiceError("actual_wallet_signing_method_for_this_message_is_unverified");
  const guarded: OfflineSigner = isOfflineDirectSigner(signer) ? {
    getAccounts,
    signDirect: async (who, doc) => {
      await getAccounts();
      await guard?.beforeSign?.();
      assertCurrent();
      if (who !== address || doc.chainId !== chain.chainId) throw new ServiceError("signing_chain_or_account_mismatch");
      const bodyBeforeSigning = doc.bodyBytes.slice();
      const accountBeforeSigning = doc.accountNumber;
      const signerInfoBytes = (bytes: Uint8Array) => AuthInfo.encode(AuthInfo.fromPartial({ signerInfos: AuthInfo.decode(bytes).signerInfos })).finish();
      const signersBeforeSigning = guard ? signerInfoBytes(doc.authInfoBytes) : null;
      const response = await signer.signDirect(who, doc);
      assertCurrent();
      if (signersBeforeSigning) {
        const signersAfterSigning = signerInfoBytes(response.signed.authInfoBytes);
        if (signersBeforeSigning.length !== signersAfterSigning.length || signersBeforeSigning.some((b, i) => b !== signersAfterSigning[i])) throw new ServiceError("wallet_changed_the_reviewed_signer_or_sequence");
      }
      if (guard && response.signed.accountNumber !== accountBeforeSigning) throw new ServiceError("wallet_changed_the_reviewed_signing_account_number");
      if (response.signed.chainId !== chain.chainId) throw new ServiceError("returned_signature_chain_differs");
      if (guard && (response.signed.bodyBytes.length !== bodyBeforeSigning.length || response.signed.bodyBytes.some((byte, i) => byte !== bodyBeforeSigning[i]))) {
        throw new ServiceError("wallet_changed_the_reviewed_transaction_body_review_again");
      }
      return response;
    },
  } : {
    getAccounts,
    signAmino: async (who, doc) => {
      await getAccounts();
      await guard?.beforeSign?.();
      assertCurrent();
      if (who !== address || doc.chain_id !== chain.chainId) throw new ServiceError("signing_chain_or_account_mismatch");
      const messagesBeforeSigning = JSON.stringify(doc.msgs);
      const memoBeforeSigning = doc.memo;
      const accountBeforeSigning = doc.account_number;
      const sequenceBeforeSigning = doc.sequence;
      const response = await signer.signAmino(who, doc);
      assertCurrent();
      if (guard && (response.signed.account_number !== accountBeforeSigning || response.signed.sequence !== sequenceBeforeSigning)) throw new ServiceError("wallet_changed_the_reviewed_signing_account_number_or_sequence");
      if (response.signed.chain_id !== chain.chainId) throw new ServiceError("returned_signature_chain_differs");
      if (guard && (JSON.stringify(response.signed.msgs) !== messagesBeforeSigning || response.signed.memo !== memoBeforeSigning)) {
        throw new ServiceError("wallet_changed_the_reviewed_transaction_body_review_again");
      }
      return response;
    },
  };
  return {
    signerAddress: address, queryClient: createQueryClient(chain),
    client: {
      signAndBroadcast: async (who: string, messages: readonly EncodeObject[], fee: StdFee) => {
        assertCurrent();
        const client = await connectSigningClient(chain, guarded, {
          gasPrice, accountParser: signingAccountParser(chain, { address, pubkey: state.pubkey! }),
        });
        try {
          assertCurrent();
          if (who !== address) throw new ServiceError("transaction_account_mismatch");
          // Separate signing from broadcast to invalidate a pending wallet prompt on account/chain change.
          const signed = await client.sign(who, messages, fee, "");
          assertCurrent();
          const bytes = TxRaw.encode(signed).finish();
          const hash = Array.from(sha256(bytes), b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
          guard?.onBroadcast?.(hash);
          return await client.broadcastTx(bytes);
        } finally { client.disconnect(); }
      },
    },
  };
}
