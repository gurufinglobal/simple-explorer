"use client";
import { useRef, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import { formatUnits, toFunctionSignature } from "viem";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { ServiceErrorText } from "@/components/query/service-error-text";
import { parseContractAbi, readEvmContract } from "@/services/evm/contract";
import { evmNetwork } from "@/services/evm/network";
import { prepareEvmContract, submitEvmTransfer, useEvmResults, type EvmSnapshot } from "@/services/evm/transfer";
import { lookupEvmTransaction, type EvmLookup } from "@/services/evm/lookup";

export function EvmContractForm({ writeEnabled = true }: { writeEnabled?: boolean }) {
  const t = useTranslations("evm");
  const wallet = useWalletSessionStore();
  const busy = useEvmResults(s => s.busy);
  const chain = getActiveChainConfig();
  const [address, setAddress] = useState("");
  const [abi, setAbi] = useState("");
  const [signature, setSignature] = useState("");
  const [args, setArgs] = useState("[]");
  const [value, setValue] = useState("0");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>();
  const [result, setResult] = useState<{ key: string; value: string }>();
  const [review, setReview] = useState<{ key: string; snapshot: EvmSnapshot }>();
  const lock = useRef(false);
  const key = JSON.stringify([chain, wallet.generation, address, abi, signature, args, value]);
  const latest = useRef(key); latest.current = key;
  let functions: ReturnType<typeof parseContractAbi> = [], abiError: unknown, configError: unknown;
  try { evmNetwork(chain); } catch (error) { configError = error; }
  if (abi) { try { functions = parseContractAbi(abi); } catch (error) { abiError = error; } }
  const selected = functions.find(fn => toFunctionSignature(fn) === signature);
  const readOnly = selected && ["pure", "view"].includes(selected.stateMutability);
  const run = async () => {
    if (lock.current || busy) return;
    lock.current = true; setWorking(true); setError(undefined); setResult(undefined); setReview(undefined);
    const captured = key, input = { address, abi, signature, arguments: args, value };
    try {
      if (readOnly) {
        const output = await readEvmContract(input);
        if (latest.current === captured) setResult({ key: captured, value: output });
      } else {
        const snapshot = await prepareEvmContract(input);
        if (latest.current === captured) setReview({ key: captured, snapshot });
      }
    } catch (error) { if (latest.current === captured) setError(error); }
    finally { lock.current = false; setWorking(false); }
  };
  const confirm = async () => {
    if (!writeEnabled || lock.current || busy || !review || review.key !== key) return;
    lock.current = true; setWorking(true); setError(undefined);
    try { await submitEvmTransfer(review.snapshot); }
    catch (error) { if (latest.current === key) setError(error); }
    finally { setReview(undefined); lock.current = false; setWorking(false); }
  };
  const snapshot = review?.snapshot;
  return <Stack spacing={2} sx={{ mt: 2, overflowWrap: "anywhere" }}>
    <Typography variant="h6">{t("contractTitle")}</Typography>
    <Alert severity="info">{t("contractNotice")}</Alert>
    {configError != null && <Alert severity="warning"><ServiceErrorText error={configError} /></Alert>}
    <TextField label={t("contractAddress")} value={address} onChange={e => setAddress(e.target.value.trim())} />
    <TextField label={t("abi")} multiline minRows={3} value={abi} onChange={e => { setAbi(e.target.value); setSignature(""); }} helperText={t("abiHelp")} />
    {abiError != null && <Alert severity="error"><ServiceErrorText error={abiError} /></Alert>}
    <TextField select label={t("function")} value={signature} onChange={e => { setSignature(e.target.value); setValue("0"); setArgs("[]"); }}>
      {functions.map(fn => { const signature = toFunctionSignature(fn); return <MenuItem key={signature} value={signature}>{signature} · {fn.stateMutability}</MenuItem>; })}
    </TextField>
    {selected && <Typography component="pre" sx={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(selected.inputs, null, 2)}</Typography>}
    <TextField label={t("arguments")} multiline minRows={2} value={args} onChange={e => setArgs(e.target.value)} helperText={t("argumentsHelp")} />
    {selected?.stateMutability === "payable" && <TextField label={t("contractValue")} value={value} onChange={e => setValue(e.target.value)} />}
    <Button disabled={working || busy || !!configError || !!abiError || !selected || !address || !readOnly && (!writeEnabled || wallet.status !== "connected")} onClick={() => void run()}>{t(readOnly ? "readContract" : "reviewContract")}</Button>
    {error != null && <Alert severity="error"><ServiceErrorText error={error} /></Alert>}
    {result?.key === key && <Stack role="status"><Typography>{t("readResult")}</Typography><Typography component="pre" sx={{ whiteSpace: "pre-wrap" }}>{result.value}</Typography></Stack>}
    <Dialog open={!!snapshot} onClose={() => { if (!working) setReview(undefined); }} fullWidth>
      <DialogTitle>{t("contractReview")}</DialogTitle><DialogContent><Stack spacing={1} sx={{ overflowWrap: "anywhere" }}>
        {snapshot && <>
          <Typography>{t("network")}: {snapshot.chain.name} / {snapshot.chain.evmChainId}</Typography>
          <Typography>{t("from")}: {snapshot.from}</Typography><Typography>{t("contractAddress")}: {snapshot.to}</Typography>
          <Typography>{t("function")}: {snapshot.contract?.signature} · {snapshot.contract?.mutability}</Typography>
          <Typography>{t("arguments")}</Typography><Typography component="pre" sx={{ whiteSpace: "pre-wrap" }}>{snapshot.contract?.arguments}</Typography>
          <Typography>{t("contractValue")}: {snapshot.displayAmount} {snapshot.asset.symbol}</Typography>
          <Typography>{t("nonce")}: {snapshot.nonce}</Typography><Typography>{t("gas")}: {snapshot.gas.toString()}</Typography>
          <Typography>{t("feeMode")}: {snapshot.chain.evm!.feeMode}</Typography>
          <Typography>{t("unitPrice")}: {BigInt(snapshot.transaction.gasPrice ?? snapshot.transaction.maxFeePerGas!).toString()}</Typography>
          <Typography>{t("fee")}: {formatUnits(snapshot.maxFee, snapshot.asset.decimals)} {snapshot.asset.symbol}</Typography>
          <Alert severity="info">{t("pendingNotice")}</Alert>
          {review?.key !== key && <Alert severity="warning">{t("contextChanged")}</Alert>}
        </>}
      </Stack></DialogContent><DialogActions>
        <Button disabled={working} onClick={() => setReview(undefined)}>{t("cancel")}</Button>
        <Button disabled={!writeEnabled || working || busy || review?.key !== key} onClick={() => void confirm()}>{t("confirm")}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}

export function EvmHashLookup() {
  const t = useTranslations("evm");
  useWalletSessionStore(s => s.generation);
  const chain = getActiveChainConfig();
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<{ key: string; value: EvmLookup }>();
  const [error, setError] = useState<unknown>();
  const [working, setWorking] = useState(false);
  const key = JSON.stringify([chain, hash.toLowerCase()]);
  const latest = useRef(key); latest.current = key;
  const lock = useRef(false);
  const run = async () => {
    if (lock.current) return;
    lock.current = true; setWorking(true); setError(undefined);
    const captured = key;
    try {
      const value = await lookupEvmTransaction(chain, hash);
      if (latest.current === captured) setResult(previous => previous?.key === captured && ["success", "reverted"].includes(previous.value.status) ? previous : { key: captured, value });
    } catch (error) { if (latest.current === captured) setError(error); }
    finally { lock.current = false; setWorking(false); }
  };
  const output = result?.key === key ? result.value : undefined;
  return <Stack spacing={2} sx={{ mt: 2, overflowWrap: "anywhere" }}>
    <Typography variant="h6">{t("hashTitle")}</Typography><Alert severity="info">{t("historyScope")}</Alert>
    <TextField label={t("evmHash")} value={hash} onChange={e => { setHash(e.target.value.trim()); setError(undefined); }} helperText={`${t("network")}: ${chain.name} / ${chain.evmChainId ?? "—"}`} />
    <Button disabled={working || !hash} onClick={() => void run()}>{t("lookupHash")}</Button>
    {error != null && <Alert severity="warning"><ServiceErrorText error={error} /></Alert>}
    {output && <Stack role="status">
      <Typography>EVM · {output.chain.name} / {output.chain.evmChainId} · {t(output.status === "unknown" ? "hashUnknown" : output.status)}</Typography><Typography>{output.hash}</Typography>
      {output.transactionType && <Typography>{t("transactionType")}: {output.transactionType}</Typography>}
      {output.from && <Typography>{t("from")}: {output.from}</Typography>}
      {output.to && <Typography>{t("to")}: {output.to}</Typography>}
      {output.to === null && <Typography>{t("deployment")}</Typography>}
      {output.value !== undefined && <Typography>{t("contractValue")}: {formatUnits(output.value, output.chain.evm!.nativeCurrency.decimals)} {output.chain.evm!.nativeCurrency.symbol}</Typography>}
      {output.actualFee !== undefined && <Typography>{t("actualFee")}: {formatUnits(output.actualFee, output.chain.evm!.nativeCurrency.decimals)} {output.chain.evm!.nativeCurrency.symbol}</Typography>}
    </Stack>}
  </Stack>;
}

export function EvmContractTools() {
  const t = useTranslations("evm");
  return <Accordion sx={{ mt: 2 }}><AccordionSummary>{t("contractTools")}</AccordionSummary>
    <AccordionDetails><EvmContractForm /><EvmHashLookup /></AccordionDetails>
  </Accordion>;
}
