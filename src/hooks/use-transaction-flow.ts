"use client";
import { useEffect, useRef, useState } from "react";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { errorMessage, type PreparedTransaction, type TransactionPhase, type TransactionReceipt } from "@/services/transactions/transaction";

export function useTransactionFlow(contextKey: string) {
  const [phase, setPhase] = useState<TransactionPhase>("input");
  const [prepared, setPrepared] = useState<PreparedTransaction | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentKey = useRef(contextKey);
  currentKey.current = contextKey;
  const active = useRef<PreparedTransaction | null>(null);
  const version = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const invalidate = () => {
      version.current += 1;
      active.current?.cancel(); active.current = null;
      busy.current = false;
      setPrepared(null); setPhase("input"); setReceipt(null);
    };
    invalidate();
    window.addEventListener("explorer:chain-changed", invalidate);
    const unsubscribe = useWalletSessionStore.subscribe((now, previous) => {
      if (now.generation !== previous.generation) invalidate();
    });
    return () => {
      version.current += 1;
      active.current?.cancel(); active.current = null;
      busy.current = false;
      unsubscribe();
      window.removeEventListener("explorer:chain-changed", invalidate);
    };
  }, [contextKey]);

  const begin = async (prepare: (assertCurrent: () => void) => Promise<PreparedTransaction>) => {
    if (busy.current) return;
    busy.current = true;
    const request = ++version.current;
    const key = contextKey;
    const isCurrent = () => request === version.current && currentKey.current === key;
    const assertCurrent = () => { if (!isCurrent()) throw new Error("입력이 변경되었습니다. 거래를 다시 확인하세요."); };
    setError(null); setReceipt(null); setPrepared(null); setPhase("validating");
    try {
      const result = await prepare(assertCurrent);
      if (!isCurrent()) { result.cancel(); return; }
      active.current = result; setPrepared(result); setPhase("confirming");
    } catch (failure) {
      if (isCurrent()) { setError(errorMessage(failure)); setPhase("input"); }
    } finally { if (isCurrent()) busy.current = false; }
  };
  const cancel = () => {
    version.current += 1; active.current?.cancel(); active.current = null;
    busy.current = false; setPrepared(null); setPhase("input");
    setError("앱 확인을 취소했습니다. 전송하지 않았습니다.");
  };
  const confirm = async () => {
    if (busy.current || !active.current) return;
    busy.current = true;
    const request = version.current;
    const key = contextKey;
    const isCurrent = () => request === version.current && currentKey.current === key;
    const tx = active.current;
    setPrepared(null); setPhase("signing"); setError(null);
    try {
      tx.assertCurrent();
      const result = await tx.execute(pending => {
        if (isCurrent()) { setReceipt(pending); setPhase("broadcasting"); }
      });
      if (isCurrent()) { setReceipt(result); setPhase("result"); }
    } catch (failure) {
      if (isCurrent()) { setError(errorMessage(failure)); setPhase("input"); }
    } finally {
      if (isCurrent()) { busy.current = false; active.current = null; }
    }
  };
  return { phase, prepared, receipt, error, begin, cancel, confirm,
    busy: phase === "validating" || phase === "signing" || phase === "broadcasting" };
}
