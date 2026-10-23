"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { formatUnits } from "viem";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { ServiceErrorText } from "@/components/query/service-error-text";
import { evmNetwork } from "@/services/evm/network";
import { loadEvmAccount, restoreEvmResults, prepareEvmTransfer, refreshEvmReceipt, submitEvmTransfer, useEvmResults, type EvmAccount, type EvmSnapshot } from "@/services/evm/transfer";

export function EvmTransactionResults({ chainKey, account }: { chainKey?: string; account?: string } = {}) {
  const t = useTranslations("evm");
  const stored = useEvmResults(state => state.results);
  const results = stored.filter(result => (!chainKey || result.snapshot.chain.key === chainKey) && (account === undefined || result.snapshot.from.toLowerCase() === account.toLowerCase()));
  const storageWarning = useEvmResults(state => state.storageWarning);
  useEffect(() => restoreEvmResults(), []);
  return results.length > 0 && <Stack spacing={2} sx={{ overflowWrap: "anywhere", mt: 2 }}>
    <Typography variant="h6">{t("history")}</Typography>{storageWarning && <Alert severity="warning">{t("storageWarning")}</Alert>}<Alert severity="info">{t("historyScope")}</Alert>
    {results.map(result => <Stack key={result.id} spacing={1} role="status">
      <Typography>{t(result.status)} · {result.snapshot.chain.name} / {result.snapshot.chain.evmChainId}</Typography>
      <Typography>{t("from")}: {result.snapshot.from}</Typography><Typography>{t("to")}: {result.snapshot.to}</Typography>
      <Typography>{result.snapshot.displayAmount} {result.snapshot.asset.symbol}{result.snapshot.asset.address ? ` · ${result.snapshot.asset.address}` : ""}</Typography>
      {result.snapshot.contract && <><Typography>{result.snapshot.contract.signature}</Typography><Typography component="pre" sx={{ whiteSpace: "pre-wrap" }}>{result.snapshot.contract.arguments}</Typography></>}
      {result.hash && <Typography>{result.hash}</Typography>}
      {result.actualFee !== undefined && <Typography>{t("actualFee")}: {formatUnits(result.actualFee, result.snapshot.chain.evm!.nativeCurrency.decimals)} {result.snapshot.chain.evm!.nativeCurrency.symbol}</Typography>}
      {result.error != null && <Alert severity="warning"><ServiceErrorText error={result.error} /></Alert>}
      {result.hash && ["pending", "unknown"].includes(result.status) && <Button onClick={() => void refreshEvmReceipt(result.id)}>{t("recheck")}</Button>}
    </Stack>)}
  </Stack>;
}
export function EvmTransferForm() {
  const t = useTranslations("evm");
  const wallet = useWalletSessionStore();
  const busy = useEvmResults(state => state.busy);
  const chain = getActiveChainConfig();
  const [kind, setKind] = useState("native");
  const [token, setToken] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>();
  const [account, setAccount] = useState<{ key: string; value: EvmAccount }>();
  const [review, setReview] = useState<{ key: string; snapshot: EvmSnapshot }>();
  const lock = useRef(false);
  const key = JSON.stringify([chain, wallet.generation, kind, token, recipient, amount]);
  const latest = useRef(key); latest.current = key;
  let configError: unknown;
  try { evmNetwork(chain); } catch (error) { configError = error; }
  const run = async (prepare: boolean) => {
    if (lock.current || busy) return;
    lock.current = true; setWorking(true); setError(undefined); setReview(undefined);
    const captured = key;
    try {
      if (prepare) {
        const snapshot = await prepareEvmTransfer({ recipient, amount, token: kind === "token" ? token : undefined });
        if (latest.current === captured) setReview({ key: captured, snapshot });
      } else {
        const value = await loadEvmAccount(kind === "token" ? token : undefined);
        if (latest.current === captured) setAccount({ key: captured, value });
      }
    } catch (error) { if (latest.current === captured) setError(error); }
    finally { lock.current = false; setWorking(false); }
  };
  const confirm = async () => {
    if (!review || review.key !== key || lock.current || busy) return;
    lock.current = true; setWorking(true); setError(undefined);
    try { await submitEvmTransfer(review.snapshot); setReview(undefined); }
    catch (error) { setError(error); setReview(undefined); }
    finally { lock.current = false; setWorking(false); }
  };
  const snapshot = review?.snapshot;
  const disabled = working || busy || !!configError || wallet.status !== "connected";
  return <Stack spacing={2} sx={{ mt: 2, overflowWrap: "anywhere" }}>
    <Typography variant="h6">{t("title")}</Typography><Alert severity="info">{t("notice")}</Alert>
    {configError != null && <Alert severity="warning"><ServiceErrorText error={configError} /></Alert>}
    <TextField select label={t("asset")} value={kind} disabled={working || busy} onChange={event => setKind(event.target.value)}>
      <MenuItem value="native">{t("native")}</MenuItem><MenuItem value="token">{t("token")}</MenuItem>
    </TextField>
    {kind === "token" && <TextField label={t("tokenAddress")} value={token} onChange={event => setToken(event.target.value.trim())} disabled={working || busy} />}
    <TextField label={t("recipient")} value={recipient} onChange={event => setRecipient(event.target.value.trim())} disabled={working || busy} />
    <TextField label={t("amount")} value={amount} onChange={event => setAmount(event.target.value)} disabled={working || busy} />
    <Button disabled={disabled || kind === "token" && !token} onClick={() => void run(false)}>{t("refresh")}</Button>
    {account?.key === key && <Stack><Typography>{t("nonce")}: {account.value.nonce}</Typography>
      {[account.value.native, ...(account.value.token ? [account.value.token] : [])].map((asset, i) => <Typography key={i}>{t("balance")}: {formatUnits(asset.balance, asset.decimals)} {asset.symbol}</Typography>)}
    </Stack>}
    <Button disabled={disabled || !recipient || !amount || kind === "token" && !token} onClick={() => void run(true)}>{t("review")}</Button>
    {error != null && <Alert severity="error"><ServiceErrorText error={error} /></Alert>}
    <Dialog open={!!snapshot} onClose={() => { if (!working) setReview(undefined); }} fullWidth>
      <DialogTitle>{t("reviewTitle")}</DialogTitle><DialogContent><Stack spacing={1} sx={{ overflowWrap: "anywhere" }}>
        {snapshot && <>
          <Typography>{t("network")}: {snapshot.chain.name} / {snapshot.chain.evmChainId}</Typography>
          <Typography>{t("from")}: {snapshot.from}</Typography><Typography>{t("to")}: {snapshot.to}</Typography>
          <Typography>{t("amount")}: {snapshot.displayAmount} {snapshot.asset.symbol}</Typography>
          {snapshot.asset.address && <Typography>{t("tokenAddress")}: {snapshot.asset.address}</Typography>}
          <Typography>{t("nonce")}: {snapshot.nonce}</Typography><Typography>{t("gas")}: {snapshot.gas.toString()}</Typography>
          <Typography>{t("feeMode")}: {snapshot.chain.evm!.feeMode}</Typography>
          <Typography>{t("unitPrice")}: {BigInt(snapshot.transaction.gasPrice ?? snapshot.transaction.maxFeePerGas!).toString()}{snapshot.transaction.maxPriorityFeePerGas ? ` / ${BigInt(snapshot.transaction.maxPriorityFeePerGas).toString()}` : ""}</Typography>
          <Typography>{t("fee")}: {formatUnits(snapshot.maxFee, snapshot.chain.evm!.nativeCurrency.decimals)} {snapshot.chain.evm!.nativeCurrency.symbol}</Typography>
          <Alert severity="info">{t("pendingNotice")}</Alert>
          {review?.key !== key && <Alert severity="warning">{t("contextChanged")}</Alert>}
        </>}
      </Stack></DialogContent><DialogActions>
        <Button disabled={working} onClick={() => setReview(undefined)}>{t("cancel")}</Button>
        <Button disabled={working || busy || review?.key !== key} onClick={() => void confirm()}>{t("confirm")}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
