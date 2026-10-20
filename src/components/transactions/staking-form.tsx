"use client";
import { useState } from "react";
import { Alert, Button, MenuItem, Stack, TextField } from "@mui/material";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { useAmountEntry } from "@/components/amount/amount-entry";
import { useTransactionFlow } from "@/hooks/use-transaction-flow";
import { prepareStakingTx, stakingBlockReason } from "@/services/guru/staking-tx.client";
import type { StakingAction } from "@/services/transactions/transaction";
import { writeBlockReason } from "@/services/wallet/chain-eligibility";
import { TransactionConfirmDialog } from "./transaction-confirm-dialog";
import { SavedTransactions, TransactionResult } from "./transaction-result";

export function StakingForm({ validatorAddress, validators, isOperator = false }: {
  validatorAddress?: string; validators?: { operatorAddress: string; moniker: string }[]; isOperator?: boolean;
}) {
  const chain = getActiveChainConfig();
  const wallet = useWalletSessionStore();
  const [selected, setSelected] = useState("");
  const validator = validatorAddress ?? selected;
  const [amount, setAmount] = useState("");
  const denom = chain.bondDenom ?? "";
  const entry = useAmountEntry(amount, denom);
  const flow = useTransactionFlow(JSON.stringify([chain.key, wallet.generation, validator, amount, denom, entry.base, entry.ready]));
  const actions: { action: StakingAction; label: string }[] = validatorAddress
    ? [{ action: "delegate", label: "Delegate" }, { action: "undelegate", label: "Undelegate" }, { action: "reward", label: "Claim Reward" }, { action: "commission", label: "Claim Operator Reward" }]
    : [{ action: "delegate", label: "Delegate Tx" }];
  const blocked = writeBlockReason(chain, wallet);
  const begin = (action: StakingAction) => flow.begin(assertCurrent => {
    if (!wallet.walletType) throw new Error("지갑을 연결하세요.");
    const base = { walletType: wallet.walletType, sessionTopic: wallet.sessionTopic, bech32Address: wallet.bech32Address, validatorAddress: validator };
    return prepareStakingTx(action === "delegate" || action === "undelegate"
      ? { ...base, action, amount: entry.requireBase(), denom, displayAmount: amount }
      : { ...base, action }, assertCurrent);
  });
  const reasons = [...new Set(actions.map(({ action }) => blocked ?? stakingBlockReason(chain, action, wallet.walletType)).filter(Boolean))];
  return <Stack spacing={1} sx={{ mt: 2 }}>
    {reasons.map(reason => <Alert key={reason} severity="info">{reason}</Alert>)}
    {!validatorAddress && <TextField select label="Validator" size="small" value={selected} onChange={e => setSelected(e.target.value)}>
      {selected && !validators?.some(v => v.operatorAddress === selected) && <MenuItem value={selected}>{selected} · 목록 갱신 중</MenuItem>}
      {(validators ?? []).map(v => <MenuItem key={v.operatorAddress} value={v.operatorAddress}>{v.moniker || v.operatorAddress}</MenuItem>)}
    </TextField>}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
      <TextField label="수량 (표시 단위)" size="small" value={amount} onChange={e => setAmount(e.target.value.trim())} fullWidth />
      <TextField label="Denom" size="small" value={denom} slotProps={{ input: { readOnly: true } }} />
    </Stack>
    {entry.confirmation}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
      {actions.map(({ action, label }) => <Button key={action} variant={action === "delegate" ? "contained" : "outlined"}
        disabled={!!blocked || !!stakingBlockReason(chain, action, wallet.walletType) || !validator || ((action === "delegate" || action === "undelegate") && !entry.ready) || (action === "commission" && !isOperator) || flow.busy || flow.phase === "confirming"}
        onClick={() => void begin(action)}>{label}</Button>)}
    </Stack>
    {flow.error && <Alert severity="warning" role="status">{flow.error}</Alert>}
    {flow.phase === "validating" && <Alert severity="info" role="status">잔액·권한·수수료 확인 중</Alert>}
    {flow.phase === "signing" && <Alert severity="info" role="status">지갑 서명 대기 중 · 입력이나 계정을 바꾸면 이 확인은 무효화됩니다.</Alert>}
    {flow.receipt && <TransactionResult key={`${flow.receipt.hash}:${flow.receipt.status}`} receipt={flow.receipt} />}
    {validatorAddress && <SavedTransactions chainKey={chain.key} excludeHash={flow.receipt?.hash} />}
    <TransactionConfirmDialog snapshot={flow.prepared?.snapshot ?? null} onCancel={flow.cancel} onConfirm={() => void flow.confirm()} />
  </Stack>;
}
