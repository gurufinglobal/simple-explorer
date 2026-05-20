"use client";

import { calculateFee, GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import { MsgDeposit, MsgExecLegacyContent, MsgSubmitProposal, MsgVote } from "cosmjs-types/cosmos/gov/v1/tx";
import { TextProposal } from "cosmjs-types/cosmos/gov/v1beta1/gov";
import { Any } from "cosmjs-types/google/protobuf/any";
import { readPublicEnv } from "@/lib/env";
import { getActiveChainRpcUrl } from "@/services/clients";
import type { VoteOption } from "@/lib/gov-types";
import {
  getAccountPubkeyBytes,
  getGovModuleAddress,
} from "./governance-query.service";
import { getNetworkSummary } from "./network-summary.service";
import { createWalletConnectOfflineSigner } from "@/services/wallet/walletconnect-cosmos-signer";

function gasPrice(): GasPrice {
  const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GAS_PRICE : undefined;
  return GasPrice.fromString(raw ?? "0.001agxn");
}

/** Cosmos SDK `VoteOption` enum values (gov v1). */
function mapProtoVoteOption(o: VoteOption): number {
  switch (o) {
    case "yes":
      return 1;
    case "abstain":
      return 2;
    case "no":
      return 3;
    case "no_with_veto":
      return 4;
    default:
      return 0;
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
  walletType: "keplr" | "metamask" | "walletconnect";
  sessionTopic: string | null;
  bech32Address: string | null;
  chainId: string;
}): Promise<OfflineSigner> {
  const { walletType, sessionTopic, bech32Address, chainId } = params;

  if (walletType === "metamask") {
    throw new Error("MetaMask cannot sign Cosmos governance transactions. Use Keplr or WalletConnect.");
  }

  if (walletType === "keplr") {
    return getKeplrSigner(chainId);
  }

  if (walletType === "walletconnect") {
    if (!sessionTopic || !bech32Address) {
      throw new Error("WalletConnect session or Cosmos address is missing.");
    }
    const pk = await getAccountPubkeyBytes(bech32Address);
    if (!pk) {
      throw new Error("Could not load account public key from chain. Deposit funds or enable the account.");
    }
    return createWalletConnectOfflineSigner({
      topic: sessionTopic,
      chainId,
      signerAddress: bech32Address,
      pubkey: pk,
    });
  }

  throw new Error("Unsupported wallet type.");
}

async function assertBrowser(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Governance transactions must be submitted from the browser.");
  }
}

export async function submitGovernanceVoteTx(params: {
  walletType: "keplr" | "metamask" | "walletconnect";
  sessionTopic: string | null;
  bech32Address: string | null;
  proposalId: string;
  option: VoteOption;
}): Promise<{ txHash: string }> {
  await assertBrowser();
  const network = await getNetworkSummary();
  const signer = await getSignerForWallet({
    walletType: params.walletType,
    sessionTopic: params.sessionTopic,
    bech32Address: params.bech32Address,
    chainId: network.chainId,
  });

  const accounts = await signer.getAccounts();
  const address = params.bech32Address ?? accounts[0]?.address ?? null;
  if (!address) {
    throw new Error("Connect a Cosmos address (Keplr or WalletConnect).");
  }

  const rpcUrl = await getActiveChainRpcUrl();
  const client = await SigningStargateClient.connectWithSigner(rpcUrl, signer, {
    gasPrice: gasPrice(),
  });

  const msg = {
    typeUrl: "/cosmos.gov.v1.MsgVote",
    value: MsgVote.fromPartial({
      proposalId: BigInt(params.proposalId),
      voter: address,
      option: mapProtoVoteOption(params.option),
      metadata: "",
    }),
  };

  const fee = calculateFee(300_000, gasPrice());
  const result = await client.signAndBroadcast(address, [msg], fee);
  if (result.code !== 0) {
    throw new Error(result.rawLog || `Tx failed with code ${result.code}`);
  }
  return { txHash: result.transactionHash };
}

export async function submitGovernanceDepositTx(params: {
  walletType: "keplr" | "metamask" | "walletconnect";
  sessionTopic: string | null;
  bech32Address: string | null;
  proposalId: string;
  amount: string;
  denom: string;
}): Promise<{ txHash: string }> {
  await assertBrowser();
  const network = await getNetworkSummary();
  const signer = await getSignerForWallet({
    walletType: params.walletType,
    sessionTopic: params.sessionTopic,
    bech32Address: params.bech32Address,
    chainId: network.chainId,
  });

  const accounts = await signer.getAccounts();
  const address = params.bech32Address ?? accounts[0]?.address ?? null;
  if (!address) {
    throw new Error("Connect a Cosmos address (Keplr or WalletConnect).");
  }

  const rpcUrl = await getActiveChainRpcUrl();
  const client = await SigningStargateClient.connectWithSigner(rpcUrl, signer, {
    gasPrice: gasPrice(),
  });

  const msg = {
    typeUrl: "/cosmos.gov.v1.MsgDeposit",
    value: MsgDeposit.fromPartial({
      proposalId: BigInt(params.proposalId),
      depositor: address,
      amount: [{ denom: params.denom, amount: params.amount }],
    }),
  };

  const fee = calculateFee(350_000, gasPrice());
  const result = await client.signAndBroadcast(address, [msg], fee);
  if (result.code !== 0) {
    throw new Error(result.rawLog || `Tx failed with code ${result.code}`);
  }
  return { txHash: result.transactionHash };
}

export async function submitTextProposalTx(params: {
  walletType: "keplr" | "metamask" | "walletconnect";
  sessionTopic: string | null;
  bech32Address: string | null;
  title: string;
  summary: string;
  description: string;
  initialDepositAmount: string;
  denom: string;
}): Promise<{ txHash: string }> {
  await assertBrowser();
  const govAddr = await getGovModuleAddress();
  if (!govAddr) {
    throw new Error("Could not resolve governance module address.");
  }

  const network = await getNetworkSummary();
  const signer = await getSignerForWallet({
    walletType: params.walletType,
    sessionTopic: params.sessionTopic,
    bech32Address: params.bech32Address,
    chainId: network.chainId,
  });

  const accounts = await signer.getAccounts();
  const address = params.bech32Address ?? accounts[0]?.address ?? null;
  if (!address) {
    throw new Error("Connect a Cosmos address (Keplr or WalletConnect).");
  }

  const tp = TextProposal.fromPartial({
    title: params.title,
    description: params.description,
  });
  const textAny = Any.fromPartial({
    typeUrl: "/cosmos.gov.v1beta1.TextProposal",
    value: TextProposal.encode(tp).finish(),
  });

  const exec = MsgExecLegacyContent.fromPartial({
    authority: govAddr,
    content: textAny,
  });

  const execAny = Any.fromPartial({
    typeUrl: "/cosmos.gov.v1.MsgExecLegacyContent",
    value: MsgExecLegacyContent.encode(exec).finish(),
  });

  const proposalMsg = MsgSubmitProposal.fromPartial({
    title: params.title,
    summary: params.summary,
    metadata: "",
    proposer: address,
    messages: [execAny],
    initialDeposit: [{ denom: params.denom, amount: params.initialDepositAmount }],
  });

  const rpcUrl = await getActiveChainRpcUrl();
  const client = await SigningStargateClient.connectWithSigner(rpcUrl, signer, {
    gasPrice: gasPrice(),
  });

  const msg = {
    typeUrl: "/cosmos.gov.v1.MsgSubmitProposal",
    value: proposalMsg,
  };

  const fee = calculateFee(900_000, gasPrice());
  const result = await client.signAndBroadcast(address, [msg], fee);
  if (result.code !== 0) {
    throw new Error(result.rawLog || `Tx failed with code ${result.code}`);
  }
  return { txHash: result.transactionHash };
}
