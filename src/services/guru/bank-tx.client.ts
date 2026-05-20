"use client";

import { calculateFee, GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { getNetworkSummary } from "./network-summary.service";
import { getAccountPubkeyBytes } from "./governance-query.service";
import { createWalletConnectOfflineSigner } from "@/services/wallet/walletconnect-cosmos-signer";
import { getActiveChainRpcUrl } from "@/services/clients";

type SupportedWallet = "keplr" | "metamask" | "walletconnect";

type SendTxInput = {
  walletType: SupportedWallet;
  sessionTopic: string | null;
  bech32Address: string | null;
  toAddress: string;
  amount: string;
  denom: string;
};

function gasPrice(): GasPrice {
  const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GAS_PRICE : undefined;
  return GasPrice.fromString(raw ?? "0.001agxn");
}

async function assertBrowser(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Bank transactions must be submitted from the browser.");
  }
}

async function getKeplrSigner(chainId: string): Promise<OfflineSigner> {
  if (typeof window === "undefined" || !window.keplr || !window.getOfflineSigner) {
    throw new Error("Keplr is not available.");
  }
  await window.keplr.enable(chainId);
  // Keplr's injected signer type can come from a different package instance; normalize to CosmJS signer type.
  return window.getOfflineSigner(chainId) as unknown as OfflineSigner;
}

async function getSignerForWallet(params: {
  walletType: SupportedWallet;
  sessionTopic: string | null;
  bech32Address: string | null;
  chainId: string;
}): Promise<OfflineSigner> {
  const { walletType, sessionTopic, bech32Address, chainId } = params;

  if (walletType === "metamask") {
    throw new Error("MetaMask cannot sign Cosmos send transactions. Use Keplr or WalletConnect.");
  }

  if (walletType === "keplr") {
    return getKeplrSigner(chainId);
  }

  if (!sessionTopic || !bech32Address) {
    throw new Error("WalletConnect session or Cosmos address is missing.");
  }
  const pubkey = await getAccountPubkeyBytes(bech32Address);
  if (!pubkey) {
    throw new Error("Could not load account public key from chain. Deposit funds or enable the account.");
  }
  return createWalletConnectOfflineSigner({
    topic: sessionTopic,
    chainId,
    signerAddress: bech32Address,
    pubkey,
  });
}

async function createSigningClient(params: {
  walletType: SupportedWallet;
  sessionTopic: string | null;
  bech32Address: string | null;
}): Promise<{
  client: SigningStargateClient;
  signerAddress: string;
}> {
  const network = await getNetworkSummary();
  const signer = await getSignerForWallet({
    walletType: params.walletType,
    sessionTopic: params.sessionTopic,
    bech32Address: params.bech32Address,
    chainId: network.chainId,
  });
  const accounts = await signer.getAccounts();
  const signerAddress = params.bech32Address ?? accounts[0]?.address ?? null;
  if (!signerAddress) {
    throw new Error("Connect a Cosmos address (Keplr or WalletConnect).");
  }

  const rpcUrl = await getActiveChainRpcUrl();
  const client = await SigningStargateClient.connectWithSigner(rpcUrl, signer, {
    gasPrice: gasPrice(),
  });
  return { client, signerAddress };
}

function assertAmount(value: string): void {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error("Amount must be an integer string in base denom.");
  }
  if (value === "0") {
    throw new Error("Amount must be greater than zero.");
  }
}

export async function submitSendTx(params: SendTxInput): Promise<{ txHash: string }> {
  await assertBrowser();
  const toAddress = params.toAddress.trim();
  if (!toAddress) {
    throw new Error("Recipient address is required.");
  }
  assertAmount(params.amount);

  const denom = params.denom.trim();
  if (!denom) {
    throw new Error("Denom is required.");
  }

  const { client, signerAddress } = await createSigningClient(params);
  const msg = {
    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
    value: MsgSend.fromPartial({
      fromAddress: signerAddress,
      toAddress,
      amount: [{ amount: params.amount, denom }],
    }),
  };
  const result = await client.signAndBroadcast(signerAddress, [msg], calculateFee(220_000, gasPrice()));
  if (result.code !== 0) {
    throw new Error(result.rawLog || `Tx failed with code ${result.code}`);
  }
  return { txHash: result.transactionHash };
}
