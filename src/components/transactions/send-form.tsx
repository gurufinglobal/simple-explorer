"use client";
import { useState } from "react";
import { bech32 } from "bech32";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { useAmountEntry } from "@/components/amount/amount-entry";
import { useTransactionFlow } from "@/hooks/use-transaction-flow";
import { prepareSendTx } from "@/services/guru/bank-tx.client";
import { writeBlockReason } from "@/services/wallet/chain-eligibility";
import { TransactionConfirmDialog } from "./transaction-confirm-dialog";
import { TransactionResult } from "./transaction-result";

export function SendForm() {
  const chain = getActiveChainConfig();
  const wallet = useWalletSessionStore();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [denom, setDenom] = useState(chain.nativeDenom ?? "");
  const entry = useAmountEntry(amount, denom);
  const flow = useTransactionFlow(JSON.stringify([chain.key, wallet.generation, recipient, amount, denom, entry.base, entry.ready]));
  let addressError = "";
  if (recipient) {
    try {
      const decoded = bech32.decode(recipient);
      if (decoded.prefix !== chain.bech32Prefix || bech32.fromWords(decoded.words).length !== 20) throw new Error();
    } catch { addressError = "수신 주소의 체크섬·길이·체인 prefix를 확인하세요."; }
  }
  const blocked = writeBlockReason(chain, wallet) ?? (!chain.sendFeePolicy ? "검증된 송금 수수료 정책이 없습니다. 수수료 미확인으로 전송을 차단합니다." : null);
  const begin = () => flow.begin(assertCurrent => {
    if (!wallet.walletType) throw new Error("지갑을 연결하세요.");
    return prepareSendTx({ walletType: wallet.walletType, sessionTopic: wallet.sessionTopic, bech32Address: wallet.bech32Address,
      toAddress: recipient, amount: entry.requireBase(), denom, displayAmount: amount }, assertCurrent);
  });
  return <Stack spacing={1} sx={{ mt: 2 }}>
    <Typography variant="subtitle2">SEND</Typography>
    {blocked && <Alert severity="info">{blocked}</Alert>}
    <TextField label="수신 주소" size="small" value={recipient} error={!!addressError} helperText={addressError}
      onChange={e => setRecipient(e.target.value.trim())} />
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
      <TextField label="수량 (표시 단위)" size="small" value={amount} onChange={e => setAmount(e.target.value.trim())} fullWidth />
      <TextField label="Denom" size="small" value={denom} onChange={e => setDenom(e.target.value.trim())} sx={{ minWidth: 140 }} />
    </Stack>
    {entry.confirmation}
    <Button variant="contained" color="info" onClick={() => void begin()}
      disabled={!!blocked || !entry.ready || !recipient || !!addressError || flow.busy || flow.phase === "confirming"}>
      {flow.phase === "validating" ? "잔액·수수료 확인 중" : "Send Tx"}
    </Button>
    {flow.error && <Alert severity="warning" role="status">{flow.error}</Alert>}
    {flow.phase === "signing" && <Alert severity="info" role="status">지갑 서명 대기 중 · 입력이나 계정을 바꾸면 이 확인은 무효화됩니다.</Alert>}
    {flow.receipt && <TransactionResult key={`${flow.receipt.hash}:${flow.receipt.status}`} receipt={flow.receipt} />}
    <TransactionConfirmDialog onExited={flow.restoreFocus} snapshot={flow.prepared?.snapshot ?? null} onCancel={flow.cancel} onConfirm={() => void flow.confirm()} />
  </Stack>;
}
