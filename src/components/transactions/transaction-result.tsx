"use client";
import { ServiceErrorText } from "@/components/query/service-error-text";
import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/layout/chain-link";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { errorMessage, transactionLink, type TransactionReceipt } from "@/services/transactions/transaction";
import { loadReceipts, mergeReceiptUpdate, queryReceipt, receiptEvent, refreshTransactionReads, saveReceipt, storedReceipt } from "@/services/transactions/receipt";

export function TransactionResult({ receipt }: { receipt: TransactionReceipt }) {
  const t = useTranslations("transaction");
  const st = useServiceText();
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
  }, [accept, t]);
  const refresh = useCallback(async () => {
    if (lock.current || !latest.current.hash) return;
    lock.current = true; setBusy(true);
    let request = revision.current;
    try {
      const next = await queryReceipt(latest.current);
      if (!alive.current || request !== revision.current) return;
      if (!saveReceipt(next)) next.feeWarning = [next.feeWarning, t("browser_storage_failed_save_the_transaction_link_before_refreshing")].filter(Boolean).join(" · ");
      accept(next);
      request = revision.current;
      const errors = next.status === "success" ? await refreshTransactionReads(next) : [];
      if (alive.current && request === revision.current) setRefreshErrors(errors);
    } catch (error) {
      if (alive.current && request === revision.current) setRefreshErrors([errorMessage(error)]);
    } finally {
      lock.current = false; if (alive.current) setBusy(false);
    }
  }, [accept, t]);
  useEffect(() => {
    if (latest.current.status === "success" || latest.current.status === "failed") void refresh();
  }, [refresh]);
  return <Stack spacing={1} sx={{ overflowWrap: "anywhere" }}>
    <Alert severity={result.status === "success" ? "success" : result.status === "failed" ? "error" : "info"} role="status" aria-live="polite">
      {<ServiceErrorText error={result} summary={t(`receiptStatus.${result.status}`)} />}{result.code !== undefined ? ` · code ${result.code}` : ""}
    </Alert>
    <Typography variant="body2">{t("transaction_chain")} {result.chainKey} / {result.chainId}</Typography>
    {result.hash ? <Link href={transactionLink(result)}>{t("transaction_details")} {result.hash}</Link>
      : result.status === "pending" ? <Alert severity="warning">{t("no_hash_is_available_so_the_result_is_uncertain")}</Alert> : null}
    <Typography variant="body2">{t("actual_chain_fees")} {result.actualFee === null ? t("not_queried") : result.actualFee.length ? result.actualFee.map(c => `${c.amount} ${c.denom}`).join(", ") : t("the_raw_amount_list_is_empty")}</Typography>
    {result.feeWarning && <Alert severity="warning">{st(result.feeWarning)}</Alert>}
    {result.queryError && <Alert severity="warning">{st(result.queryError)}</Alert>}
    {result.governance?.action === "proposal" && result.status === "success" && (
      result.governance.proposalId
        ? <Link href={`/governance/${encodeURIComponent(result.governance.proposalId)}?chain=${encodeURIComponent(result.chainKey)}`}>{t("new_proposal_confirmed_by_event")}{result.governance.proposalId}</Link>
        : <Alert severity="warning">{st(result.proposalIdWarning ?? t("new_proposal_id_unknown_shown_after_querying_transaction_events"))}</Alert>
    )}
    {refreshErrors.length > 0 && <Alert severity="warning">{t("transaction_succeeded_but_screen_refresh_failed")} {refreshErrors.map(error => st(error)).join(" / ")}</Alert>}
    {result.hash && <Button disabled={busy} onClick={() => void refresh()}>{busy ? t("refreshing_query") : t("reload_transaction_status_and_related_queries")}</Button>}
  </Stack>;
}

export function SavedTransactions({ chainKey, excludeHash, account }: { chainKey: string; excludeHash?: string | null; account?: string }) {
  const t = useTranslations("transaction");
  const [records, setRecords] = useState<TransactionReceipt[]>([]);
  useEffect(() => {
    const load = () => setRecords(loadReceipts());
    load();
    window.addEventListener(receiptEvent, load); window.addEventListener("storage", load);
    return () => { window.removeEventListener(receiptEvent, load); window.removeEventListener("storage", load); };
  }, []);
  const visible = records.filter(r => r.chainKey === chainKey && r.hash !== excludeHash && (account === undefined || r.sender === account));
  return visible.length ? <details><summary>{t("saved_transaction_results")}{visible.length})</summary>
    {visible.map(r => <SavedTransaction key={`${r.chainKey}:${r.hash}`} receipt={r} />)}
  </details> : null;
}
function SavedTransaction({ receipt }: { receipt: TransactionReceipt }) {
  const t = useTranslations("transaction");
  const [open, setOpen] = useState(false);
  return <Stack spacing={1} sx={{ my: 1 }}>
    <Button onClick={() => setOpen(v => !v)}>{receipt.status === "pending" ? t("checking") : t("saved_result")} · {receipt.hash}</Button>
    {open && <TransactionResult receipt={receipt} />}
  </Stack>;
}
