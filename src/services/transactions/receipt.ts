import { z } from "zod";
import { getChainByKey } from "@/lib/env";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { requestJson, createQueryClient } from "@/services/clients";
import { verifyLcdChain } from "@/services/wallet/chain-eligibility";
import { getAddressBalances } from "@/services/guru/address-profile.service";
import { getTransactionsByAddress } from "@/services/guru/transactions.service";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { useWalletPortfolioStore } from "@/stores/wallet-portfolio.store";
import { errorMessage, type TransactionReceipt } from "./transaction";

const coin = z.object({ amount: z.string().regex(/^\d+$/), denom: z.string().min(1) });
const receiptSchema = z.object({
  chainKey: z.string(), chainId: z.string(), sender: z.string(), hash: z.string().regex(/^[A-Fa-f0-9]{64}$/).nullable(),
  status: z.enum(["pending", "success", "failed", "cancelled"]), message: z.string(),
  code: z.number().int().optional(), estimatedFee: z.array(coin), actualFee: z.array(coin).nullable(), feeWarning: z.string().optional(),
});
const storageKey = "explorer:transaction-receipts:v1";
export const receiptEvent = "explorer:transaction-receipts";
export function loadReceipts(): TransactionReceipt[] {
  try {
    const parsed = z.array(receiptSchema).safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
    return parsed.success ? parsed.data.slice(-20) : [];
  } catch { return []; }
}
/** Store public chain/hash/result data, never signed bytes or wallet session material. */
export function saveReceipt(receipt: TransactionReceipt): boolean {
  if (!receipt.hash) return false;
  try {
    const records = loadReceipts().filter(r => r.chainKey !== receipt.chainKey || r.hash !== receipt.hash);
    localStorage.setItem(storageKey, JSON.stringify([...records, receipt].slice(-20)));
    window.dispatchEvent(new Event(receiptEvent));
    return true;
  } catch { return false; }
}
function receiptChain(receipt: TransactionReceipt) {
  const chain = getChainByKey(receipt.chainKey);
  if (!chain || chain.chainId !== receipt.chainId) throw new Error("거래 체인 설정이 변경되었거나 없습니다. 원래 체인 설정을 확인하세요.");
  return chain;
}
/** Missing/malformed raw fee is not zero and is never replaced by the estimate. */
export async function queryReceipt(receipt: TransactionReceipt): Promise<TransactionReceipt> {
  try {
    const chain = receiptChain(receipt);
    if (!receipt.hash || !/^[a-fA-F0-9]{64}$/.test(receipt.hash)) throw new Error("해시가 없어 거래 상태를 조회할 수 없습니다.");
    await verifyLcdChain(chain);
    const raw = await requestJson<unknown>(`${chain.lcdUrl.replace(/\/$/, "")}/cosmos/tx/v1beta1/txs/${receipt.hash}`);
    const response = z.object({
      tx_response: z.object({ txhash: z.string(), code: z.number().int().nonnegative(), height: z.string().regex(/^[1-9]\d*$/), raw_log: z.string().optional() }),
      tx: z.object({ auth_info: z.object({ fee: z.object({ amount: z.unknown().optional() }).optional() }).optional() }).optional(),
    }).parse(raw);
    if (response.tx_response.txhash.toUpperCase() !== receipt.hash.toUpperCase()) throw new Error("조회한 거래 해시가 요청과 다릅니다.");
    const parsedFee = z.array(coin).safeParse(response.tx?.auth_info?.fee?.amount);
    const actualFee = parsedFee.success ? parsedFee.data : null;
    const normalized = (coins: typeof actualFee) => JSON.stringify(coins?.map(c => `${c.denom}:${BigInt(c.amount)}`).sort());
    const feeWarning = actualFee === null ? "실제 수수료 원문 미조회 또는 형식 불일치"
      : normalized(actualFee) !== normalized(receipt.estimatedFee) ? "실제 체인 수수료가 앱 예상 수수료와 다릅니다." : undefined;
    return { ...receipt, status: response.tx_response.code === 0 ? "success" : "failed",
      code: response.tx_response.code, actualFee, feeWarning,
      message: response.tx_response.code === 0 ? "체인 포함 성공" : response.tx_response.raw_log || `체인 실행 실패 (code ${response.tx_response.code})` };
  } catch (error) {
    return { ...receipt, message: receipt.status === "pending" ? `확인 중 · ${errorMessage(error)}` : receipt.message,
      feeWarning: `거래 상세 재조회 실패 · ${errorMessage(error)}` };
  }
}

export async function refreshTransactionReads(receipt: TransactionReceipt): Promise<string[]> {
  const chain = receiptChain(receipt);
  const client = createQueryClient(chain);
  const jobs: [string, () => Promise<unknown>][] = [
    ["송신자 잔액", () => getAddressBalances(receipt.sender, client)],
    ["주소 거래", () => getTransactionsByAddress(receipt.sender, 30, client)],
  ];
  if (getActiveChainConfig().key === chain.key && useWalletSessionStore.getState().bech32Address === receipt.sender) {
    jobs.push(["지갑 자산", async () => {
      const portfolio = useWalletPortfolioStore.getState();
      portfolio.clear();
      await portfolio.refresh(receipt.sender);
      const result = useWalletPortfolioStore.getState().result;
      if (result.context.chain === chain.key && result.context.target === `portfolio:${receipt.sender}` && result.status !== "success") {
        throw new Error(result.error?.message ?? "자산 일부를 조회하지 못했습니다.");
      }
    }]);
  }
  window.dispatchEvent(new CustomEvent("explorer:queries-invalidated", { detail: {
    chain: chain.key,
    targets: [`balances:${receipt.sender}`, `address-transactions:${receipt.sender}`, `address-portfolio:${receipt.sender}`, `transaction:${receipt.hash}`],
  } }));
  const results = await Promise.allSettled(jobs.map(([, read]) => read()));
  return results.flatMap((result, i) => result.status === "rejected" ? [`${jobs[i][0]}: ${errorMessage(result.reason)}`] : []);
}
