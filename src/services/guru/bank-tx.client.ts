"use client";

import { calculateFee, GasPrice } from "@cosmjs/stargate";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";

import { createBoundSigningClient } from "@/services/wallet/signing-context";

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

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("Bank transactions must be submitted from the browser.");
  }
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
  assertBrowser();
  const toAddress = params.toAddress.trim();
  if (!toAddress) {
    throw new Error("Recipient address is required.");
  }
  assertAmount(params.amount);

  const denom = params.denom.trim();
  if (!denom) {
    throw new Error("Denom is required.");
  }

  const { client, signerAddress } = await createBoundSigningClient(params, gasPrice());
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
