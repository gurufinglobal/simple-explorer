import { sanitizeInput } from "@/lib/sanitize";
import type { HandlerResult } from "./types";

type FaucetResponse =
  | {
      status: "sent";
      rateLimitSource: "onchain_history";
      nextAvailableAt: string;
      lastDisbursementTxHash: string;
      message: string;
    }
  | {
      status: "rejected";
      rateLimitSource: "onchain_history";
      nextAvailableAt: string;
      lastDisbursementTxHash: string;
      message: string;
    }
  | { message: string };

const faucetHistory = new Map<string, { lastDisbursementAt: Date; txHash: string }>();

function nextAllowedDate(lastDisbursementAt: Date): Date {
  return new Date(lastDisbursementAt.getTime() + 24 * 60 * 60 * 1000);
}

export function requestFaucet(addressInput?: string): HandlerResult<FaucetResponse> {
  const address = sanitizeInput(addressInput ?? "");
  if (!address) {
    return { status: 400, body: { message: "address는 필수입니다." } };
  }

  const now = new Date();
  const existing = faucetHistory.get(address);
  if (existing) {
    const nextDate = nextAllowedDate(existing.lastDisbursementAt);
    if (now < nextDate) {
      return {
        status: 429,
        body: {
          status: "rejected",
          rateLimitSource: "onchain_history",
          nextAvailableAt: nextDate.toISOString(),
          lastDisbursementTxHash: existing.txHash,
          message: "온체인 지급 이력 기준으로 24시간 제한에 걸렸습니다.",
        },
      };
    }
  }

  const txHash = `0x${Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64)}`;
  faucetHistory.set(address, { lastDisbursementAt: now, txHash });
  return {
    status: 200,
    body: {
      status: "sent",
      rateLimitSource: "onchain_history",
      nextAvailableAt: nextAllowedDate(now).toISOString(),
      lastDisbursementTxHash: txHash,
      message: "Faucet 요청이 처리되었습니다.",
    },
  };
}
