"use client";
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
      throw new Error("체인·지갑·계정이 변경되었습니다. 다시 연결하고 거래를 확인하세요.");
    }
  };
  assertCurrent();
  const reason = writeBlockReason(chain, state);
  if (reason) throw new Error(reason);
  if (gasPrice.denom !== chain.feeDenom) throw new Error("수수료 denom이 검증된 체인 설정과 다릅니다.");
  const address = state.bech32Address!;
  if (bech32.decode(address).prefix !== chain.bech32Prefix) throw new Error("계정 prefix가 선택 체인과 다릅니다.");
  await verifyChainEndpoints(chain);
  assertCurrent();
  let signer: OfflineSigner;
  if (params.walletType === "keplr") {
    signer = cosmosKeplrSigner(await getKeplrSigner(chain, assertCurrent), chain, assertCurrent);
  } else {
    const session = await getActiveWalletConnectSession(state.sessionTopic!);
    assertCurrent();
    if (!session) throw new Error("WalletConnect 세션이 없습니다. 다시 연결하세요.");
    assertWalletConnectApproval(session, chain, address);
    signer = createWalletConnectOfflineSigner({ topic: state.sessionTopic!, chainId: chain.chainId!, signerAddress: address, pubkey: state.pubkey!, assertCurrent });
  }
  const getAccounts = async () => {
    assertCurrent();
    const accounts = await signer.getAccounts();
    assertCurrent();
    const account = accounts.find(a => a.address === address);
    if (!account || !account.pubkey?.length || !state.pubkey || account.pubkey.length !== state.pubkey.length || account.pubkey.some((v, i) => v !== state.pubkey![i])) {
      throw new Error("실제 signer 계정·공개키가 연결 계정과 다릅니다. 다시 연결하세요.");
    }
    assertCosmosWalletKey(chain, account.address, account.pubkey, account.algo);
    return accounts;
  };
  await getAccounts();
  const signingMethod = isOfflineDirectSigner(signer) ? "direct" : "amino";
  if (!chain.signingProfile!.signModes.includes(signingMethod)) throw new Error("체인 프로필이 실제 signer 방식을 허용하지 않습니다.");
  if (!chain.signing?.some(s => s.wallet === state.walletType && s.method === signingMethod)) throw new Error("실제 signer 방식이 검증된 서명 방식과 다릅니다.");
  if (guard?.allowedSigning && !guard.allowedSigning.some(s => s.wallet === state.walletType && s.method === signingMethod)) throw new Error("이 메시지의 실제 지갑 서명 방식은 검증되지 않았습니다.");
  const guarded: OfflineSigner = isOfflineDirectSigner(signer) ? {
    getAccounts,
    signDirect: async (who, doc) => {
      await getAccounts();
      await guard?.beforeSign?.();
      assertCurrent();
      if (who !== address || doc.chainId !== chain.chainId) throw new Error("서명 대상 체인·계정 불일치");
      const bodyBeforeSigning = doc.bodyBytes.slice();
      const accountBeforeSigning = doc.accountNumber;
      const signerInfoBytes = (bytes: Uint8Array) => AuthInfo.encode(AuthInfo.fromPartial({ signerInfos: AuthInfo.decode(bytes).signerInfos })).finish();
      const signersBeforeSigning = guard ? signerInfoBytes(doc.authInfoBytes) : null;
      const response = await signer.signDirect(who, doc);
      assertCurrent();
      if (signersBeforeSigning) {
        const signersAfterSigning = signerInfoBytes(response.signed.authInfoBytes);
        if (signersBeforeSigning.length !== signersAfterSigning.length || signersBeforeSigning.some((b, i) => b !== signersAfterSigning[i])) throw new Error("지갑이 확인한 signer·sequence를 변경했습니다.");
      }
      if (guard && response.signed.accountNumber !== accountBeforeSigning) throw new Error("지갑이 확인한 서명 계정 번호를 변경했습니다.");
      if (response.signed.chainId !== chain.chainId) throw new Error("반환된 서명의 체인이 다릅니다.");
      if (guard && (response.signed.bodyBytes.length !== bodyBeforeSigning.length || response.signed.bodyBytes.some((byte, i) => byte !== bodyBeforeSigning[i]))) {
        throw new Error("지갑이 확인한 거래 본문을 변경했습니다. 다시 확인하세요.");
      }
      return response;
    },
  } : {
    getAccounts,
    signAmino: async (who, doc) => {
      await getAccounts();
      await guard?.beforeSign?.();
      assertCurrent();
      if (who !== address || doc.chain_id !== chain.chainId) throw new Error("서명 대상 체인·계정 불일치");
      const messagesBeforeSigning = JSON.stringify(doc.msgs);
      const memoBeforeSigning = doc.memo;
      const accountBeforeSigning = doc.account_number;
      const sequenceBeforeSigning = doc.sequence;
      const response = await signer.signAmino(who, doc);
      assertCurrent();
      if (guard && (response.signed.account_number !== accountBeforeSigning || response.signed.sequence !== sequenceBeforeSigning)) throw new Error("지갑이 확인한 서명 계정 번호·sequence를 변경했습니다.");
      if (response.signed.chain_id !== chain.chainId) throw new Error("반환된 서명의 체인이 다릅니다.");
      if (guard && (JSON.stringify(response.signed.msgs) !== messagesBeforeSigning || response.signed.memo !== memoBeforeSigning)) {
        throw new Error("지갑이 확인한 거래 본문을 변경했습니다. 다시 확인하세요.");
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
          if (who !== address) throw new Error("거래 계정 불일치");
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
