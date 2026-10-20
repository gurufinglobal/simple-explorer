import type { StdFee } from "@cosmjs/amino";
import type { Coin } from "@/lib/cosmos-amount";

export type StakingAction = "delegate" | "undelegate" | "reward" | "commission";
export type StakingContext = Readonly<{ action: StakingAction; validator: string }>;
export type GovernanceAction = "vote" | "deposit" | "proposal";
export type GovernanceContext = Readonly<{ action: GovernanceAction; proposalId?: string }>;

export type TransactionSnapshot = Readonly<{
  action: string; chainKey: string; chainId: string; sender: string; recipient: string;
  displayAmount?: string; unit?: string; amount?: string; denom?: string;
  targetLabel?: string; observedRewards?: readonly Coin[];
  governance?: Readonly<{ option?: string; title?: string; summary?: string; description?: string; depositPolicy?: string }>;
  fee: StdFee; feeBasis: string; preparedAt: number;
}>;
export type TransactionPhase = "input" | "validating" | "confirming" | "signing" | "broadcasting" | "result";
export type TransactionReceipt = {
  chainKey: string; chainId: string; sender: string; hash: string | null;
  status: "pending" | "success" | "failed" | "cancelled";
  message: string; code?: number; estimatedFee: Coin[];
  staking?: StakingContext;
  governance?: GovernanceContext;
  proposalIdWarning?: string;
  actualFee: Coin[] | null; feeWarning?: string; queryError?: string;
};
export type PreparedTransaction = {
  snapshot: TransactionSnapshot;
  cancel: () => void;
  assertCurrent: () => void;
  execute: (onBroadcast: (receipt: TransactionReceipt) => void) => Promise<TransactionReceipt>;
};
export function transactionLink(receipt: Pick<TransactionReceipt, "chainKey" | "hash">) {
  return `/tx/${encodeURIComponent(receipt.hash ?? "")}?chain=${encodeURIComponent(receipt.chainKey)}`;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청 결과를 확인할 수 없습니다.";
}
