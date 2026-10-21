"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/layout/chain-link";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { errorMessage, transactionLink, type TransactionReceipt } from "@/services/transactions/transaction";
import { loadReceipts, mergeReceiptUpdate, queryReceipt, receiptEvent, refreshTransactionReads, saveReceipt, storedReceipt } from "@/services/transactions/receipt";

export function TransactionResult({ receipt }: { receipt: TransactionReceipt }) {
  const [result, setResult] = useState(receipt);
  const latest = useRef(receipt);
  const [busy, setBusy] = useState(false);
  const [refreshErrors, setRefreshErrors] = useState<string[]>([]);
  const lock = useRef(false);
  const alive = useRef(true);
  const revision = useRef(0);
  const accept = useCallback((next: TransactionReceipt) => {
    next = mergeReceiptUpdate(latest.current, next);
    if (JSON.stringify(next) === JSON.stringify(latest.current)) return;
    revision.current += 1;
    latest.current = next;
    setResult(next);
    setRefreshErrors([]);
  }, []);
  useEffect(() => { accept(receipt); }, [receipt, accept]);
  useEffect(() => {
    alive.current = true;
    // Read synchronously on storage events so a pending promise cannot commit
    // before React renders the updated SavedTransactions props.
    const load = () => {
      const current = storedReceipt(latest.current);
      if (current) accept(current);
    };
    load();
    window.addEventListener(receiptEvent, load);
    window.addEventListener("storage", load);
    return () => {
      alive.current = false; revision.current += 1;
      window.removeEventListener(receiptEvent, load);
      window.removeEventListener("storage", load);
    };
  }, [accept]);
  const refresh = useCallback(async () => {
    if (lock.current || !latest.current.hash) return;
    lock.current = true; setBusy(true);
    let request = revision.current;
    try {
      const next = await queryReceipt(latest.current);
      if (!alive.current || request !== revision.current) return;
      if (!saveReceipt(next)) next.feeWarning = [next.feeWarning, "브라우저 저장 실패: 새로고침 전에 거래 링크를 보관하세요."].filter(Boolean).join(" · ");
      accept(next);
      request = revision.current;
      const errors = next.status === "success" ? await refreshTransactionReads(next) : [];
      if (alive.current && request === revision.current) setRefreshErrors(errors);
    } catch (error) {
      if (alive.current && request === revision.current) setRefreshErrors([errorMessage(error)]);
    } finally {
      lock.current = false; if (alive.current) setBusy(false);
    }
  }, [accept]);
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
    {result.queryError && <Alert severity="warning">{result.queryError}</Alert>}
    {result.governance?.action === "proposal" && result.status === "success" && (
      result.governance.proposalId
        ? <Link href={`/governance/${encodeURIComponent(result.governance.proposalId)}?chain=${encodeURIComponent(result.chainKey)}`}>이벤트로 확인한 새 제안 #{result.governance.proposalId}</Link>
        : <Alert severity="warning">{result.proposalIdWarning ?? "새 제안 ID 미확인 · 거래 이벤트 조회 후 표시합니다."}</Alert>
    )}
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
