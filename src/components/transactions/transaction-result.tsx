"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { errorMessage, transactionLink, type TransactionReceipt } from "@/services/transactions/transaction";
import { loadReceipts, queryReceipt, receiptEvent, refreshTransactionReads, saveReceipt } from "@/services/transactions/receipt";

export function TransactionResult({ receipt }: { receipt: TransactionReceipt }) {
  const [result, setResult] = useState(receipt);
  const latest = useRef(receipt);
  const [busy, setBusy] = useState(false);
  const [refreshErrors, setRefreshErrors] = useState<string[]>([]);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const refresh = useCallback(async () => {
    if (lock.current || !latest.current.hash) return;
    lock.current = true; setBusy(true);
    try {
      const next = await queryReceipt(latest.current);
      latest.current = next;
      if (!saveReceipt(next)) next.feeWarning = [next.feeWarning, "브라우저 저장 실패: 새로고침 전에 거래 링크를 보관하세요."].filter(Boolean).join(" · ");
      const errors = next.status === "success" ? await refreshTransactionReads(next) : [];
      if (alive.current) { setResult(next); setRefreshErrors(errors); }
    } catch (error) {
      if (alive.current) setRefreshErrors([errorMessage(error)]);
    } finally {
      lock.current = false; if (alive.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (latest.current.status === "success" || latest.current.status === "failed") void refresh();
  }, [refresh]);
  return <Stack spacing={1} sx={{ overflowWrap: "anywhere" }}>
    <Alert severity={result.status === "success" ? "success" : result.status === "failed" ? "error" : "info"} role="status" aria-live="polite">
      {result.message}{result.code !== undefined ? ` · code ${result.code}` : ""}
    </Alert>
    <Typography variant="body2">거래 체인: {result.chainKey} / {result.chainId}</Typography>
    {result.hash ? <Link href={transactionLink(result)}>거래 상세 · {result.hash}</Link>
      : result.status === "pending" ? <Alert severity="warning">해시가 없어 결과가 불명확합니다. 지갑·체인 기록을 확인하고 임의로 재전송하지 마세요.</Alert> : null}
    <Typography variant="body2">실제 체인 수수료: {result.actualFee === null ? "미조회" : result.actualFee.length ? result.actualFee.map(c => `${c.amount} ${c.denom}`).join(", ") : "원문 amount 목록이 비어 있음"}</Typography>
    {result.feeWarning && <Alert severity="warning">{result.feeWarning}</Alert>}
    {refreshErrors.length > 0 && <Alert severity="warning">거래 성공 후 화면 갱신 실패 · {refreshErrors.join(" / ")}</Alert>}
    {result.hash && <Button disabled={busy} onClick={() => void refresh()}>{busy ? "조회 갱신 중" : "거래 상태·관련 조회 다시 읽기"}</Button>}
  </Stack>;
}

export function SavedTransactions({ chainKey, excludeHash }: { chainKey: string; excludeHash?: string | null }) {
  const [records, setRecords] = useState<TransactionReceipt[]>([]);
  useEffect(() => {
    const load = () => setRecords(loadReceipts());
    load();
    window.addEventListener(receiptEvent, load); window.addEventListener("storage", load);
    return () => { window.removeEventListener(receiptEvent, load); window.removeEventListener("storage", load); };
  }, []);
  const visible = records.filter(r => r.chainKey === chainKey && r.hash !== excludeHash);
  return visible.length ? <details><summary>보관된 거래 결과 ({visible.length})</summary>
    {visible.map(r => <SavedTransaction key={`${r.chainKey}:${r.hash}`} receipt={r} />)}
  </details> : null;
}
function SavedTransaction({ receipt }: { receipt: TransactionReceipt }) {
  const [open, setOpen] = useState(false);
  return <Stack spacing={1} sx={{ my: 1 }}>
    <Button onClick={() => setOpen(v => !v)}>{receipt.status === "pending" ? "확인 중" : "보관 결과"} · {receipt.hash}</Button>
    {open && <TransactionResult receipt={receipt} />}
  </Stack>;
}
