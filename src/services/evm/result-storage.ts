import { z } from "zod";
import { ChainConfigSchema } from "@/lib/env";
import type { EvmResult } from "./transfer";

const integer = z.string().regex(/^\d+$/).max(160).transform(value => BigInt(value));
const hex = z.custom<`0x${string}`>(value => typeof value === "string" && /^0x[0-9a-f]+$/i.test(value));
const address = z.custom<`0x${string}`>(value => typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value));
const resultSchema = z.object({
  id: z.string(), status: z.enum(["submitting", "pending", "unknown", "success", "reverted", "rejected"]),
  hash: z.custom<`0x${string}`>(value => typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value)).optional(), actualFee: integer.optional(),
  snapshot: z.object({
    contract: z.object({ signature: z.string().max(65536), arguments: z.string().max(131072), mutability: z.string() }).optional(),
    chain: ChainConfigSchema, from: address, to: address,
    asset: z.object({ address: address.optional(), symbol: z.string().max(64), decimals: z.number().int().min(0).max(255), balance: integer }),
    amount: integer, displayAmount: z.string(), nonce: z.number().int().nonnegative(), gas: integer, maxFee: integer, createdAt: z.number(),
    transaction: z.object({ from: address, to: address, value: hex, data: hex.optional(), chainId: hex, nonce: hex, gas: hex,
      gasPrice: hex.optional(), maxFeePerGas: hex.optional(), maxPriorityFeePerGas: hex.optional() }),
  }),
});
export const evmResultStorageKey = "explorer:evm-results:v1";
/** Public unsigned request/receipt metadata only. Never persist provider, session or error payloads. */
export function saveEvmResults(results: EvmResult[]): boolean {
  try {
    localStorage.setItem(evmResultStorageKey, JSON.stringify(results.slice(0, 20).map(({ id, status, hash, actualFee, snapshot }) => ({ id, status, hash, actualFee, snapshot })), (_, value) => typeof value === "bigint" ? value.toString() : value));
    return true;
  } catch { return false; }
}
export function loadEvmResults(): EvmResult[] {
  try {
    const parsed = z.array(resultSchema).max(20).safeParse(JSON.parse(localStorage.getItem(evmResultStorageKey) ?? "[]"));
    // A page reload cannot determine whether a wallet request broadcast.
    return parsed.success ? parsed.data.map(result => ({ ...result, status: result.status === "submitting" ? "unknown" : result.status })) : [];
  } catch { return []; }
}
