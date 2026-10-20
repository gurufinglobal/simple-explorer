"use client";

import { assertBaseAmount } from "@/lib/cosmos-amount";
import { calculateFee, GasPrice } from "@cosmjs/stargate";
import { MsgDeposit, MsgExecLegacyContent, MsgSubmitProposal, MsgVote } from "cosmjs-types/cosmos/gov/v1/tx";
import { TextProposal } from "cosmjs-types/cosmos/gov/v1beta1/gov";
import { Any } from "cosmjs-types/google/protobuf/any";
import type { VoteOption } from "@/lib/gov-types";
import { getGovModuleAddress } from "./governance-query.service";
import { createBoundSigningClient } from "@/services/wallet/signing-context";

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

function assertBrowser(): void {
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
  assertBrowser();
  const { client, signerAddress: address } = await createBoundSigningClient(params, gasPrice());

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
  assertBrowser();
  assertBaseAmount(params.amount);
  if (!params.denom) throw new Error("Denom 미확인");
  const { client, signerAddress: address } = await createBoundSigningClient(params, gasPrice());

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
  assertBrowser();
  assertBaseAmount(params.initialDepositAmount);
  if (!params.denom) throw new Error("Denom 미확인");
  const { client, signerAddress: address, queryClient } = await createBoundSigningClient(params, gasPrice());
  const govAddr = await getGovModuleAddress(queryClient);
  if (!govAddr) throw new Error("Could not resolve governance module address.");

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
