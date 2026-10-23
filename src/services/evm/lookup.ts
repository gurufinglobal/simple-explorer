import { TransactionNotFoundError, TransactionReceiptNotFoundError, type Address, type Hex } from "viem";
import { ServiceError } from "@/i18n/service-message";
import type { ChainConfig } from "@/lib/env";
import { recordEvmReceipt } from "./transfer";
import { verifyEvmRpc } from "./network";

export type EvmLookup = {
  networkType: "evm"; chain: ChainConfig; hash: Hex; status: "unknown" | "pending" | "success" | "reverted";
  from?: Address; to?: Address | null; value?: bigint; transactionType?: string; actualFee?: bigint;
};
export async function lookupEvmTransaction(chain: ChainConfig, input: string): Promise<EvmLookup> {
  // Cosmos hashes (unprefixed 64 hex) never enter this EVM-only path.
  if (!/^0x[0-9a-f]{64}$/i.test(input)) throw new ServiceError("evm_invalid_hash");
  const hash = input.toLowerCase() as Hex;
  const snapshot = structuredClone(chain);
  const client = await verifyEvmRpc(snapshot);
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }).catch(error => { if (error instanceof TransactionNotFoundError) return null; throw error; }),
    client.getTransactionReceipt({ hash }).catch(error => { if (error instanceof TransactionReceiptNotFoundError) return null; throw error; }),
  ]);
  if (tx && (tx.hash.toLowerCase() !== hash || tx.chainId !== undefined && tx.chainId !== Number(snapshot.evmChainId))) throw new ServiceError("evm_receipt_mismatch");
  if (receipt && (receipt.transactionHash.toLowerCase() !== hash || !["success", "reverted"].includes(receipt.status) || tx && (receipt.from.toLowerCase() !== tx.from.toLowerCase() || receipt.to?.toLowerCase() !== tx.to?.toLowerCase()))) throw new ServiceError("evm_receipt_mismatch");
  if (receipt) recordEvmReceipt(snapshot, receipt);
  return { networkType: "evm", chain: snapshot, hash, status: receipt ? receipt.status : tx ? "pending" : "unknown", from: tx?.from ?? receipt?.from, to: tx ? tx.to : receipt?.to,
    value: tx?.value, transactionType: tx?.type, actualFee: receipt ? receipt.gasUsed * receipt.effectiveGasPrice : undefined };
}
