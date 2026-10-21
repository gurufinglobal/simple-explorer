"use client";

import { useAmountEntry } from "@/components/amount/amount-entry";
import Link from "@/components/layout/chain-link";
import { useState } from "react";
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { prepareGovernanceTx, governanceBlockReason } from "@/services/guru/governance-tx.client";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { writeBlockReason } from "@/services/wallet/chain-eligibility";
import { useTransactionFlow } from "@/hooks/use-transaction-flow";
import { TransactionConfirmDialog } from "@/components/transactions/transaction-confirm-dialog";
import { TransactionResult, SavedTransactions } from "@/components/transactions/transaction-result";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

type Props = {
  defaultDenom: string;
};

export function GovernanceNewProposalForm({ defaultDenom }: Props) {
  const { walletType, bech32Address, sessionTopic, status } = useWalletSessionStore();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [deposit, setDeposit] = useState("");
  const [denom, setDenom] = useState(defaultDenom);
  const wallet = useWalletSessionStore();
  const chain = getActiveChainConfig();
  const amountEntry = useAmountEntry(deposit, denom);
  const flow = useTransactionFlow(JSON.stringify([chain.key, wallet.generation, title, summary, description, deposit, denom, amountEntry.base, amountEntry.ready]));
  const reason = writeBlockReason(chain, wallet) ?? governanceBlockReason(chain, "proposal", walletType);
  const canSign = !reason;
  const busy = flow.busy || flow.phase === "confirming";
  const metamask = status === "connected" && walletType === "metamask";
  const onSubmit = () => flow.begin(assertCurrent => {
    if (!walletType) throw new Error("지갑을 연결하세요.");
    return prepareGovernanceTx({ walletType, sessionTopic, bech32Address, action: "proposal",
      title: title.trim(), summary: summary.trim(), description: description.trim() || summary.trim(),
      amount: amountEntry.requireBase(), denom, displayAmount: deposit }, assertCurrent);
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          새 텍스트 제안
        </Typography>
        <Button component={Link} href="/governance" variant="outlined" size="small">
          목록
        </Button>
      </Stack>

      {metamask ? (
        <Alert severity="info">MetaMask는 Cosmos 제안 서명을 지원하지 않습니다. 검증된 Keplr Direct 서명 설정이 필요합니다.</Alert>
      ) : null}
      {reason && <Alert severity="info">{reason}</Alert>}
      {flow.error && <Alert severity="warning" role="status">{flow.error}</Alert>}
      {flow.phase === "validating" && <Alert severity="info" role="status">Params·authority·잔액·수수료 확인 중</Alert>}
      {flow.phase === "signing" && <Alert severity="info" role="status">지갑 서명 대기 중</Alert>}
      {flow.receipt && <TransactionResult key={`${flow.receipt.hash}:${flow.receipt.status}`} receipt={flow.receipt} />}
      <SavedTransactions chainKey={chain.key} excludeHash={flow.receipt?.hash} />
      <TransactionConfirmDialog onExited={flow.restoreFocus} snapshot={flow.prepared?.snapshot ?? null} onCancel={flow.cancel} onConfirm={() => void flow.confirm()} />

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <TextField label="제목" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth required />
            <TextField
              label="요약 (summary)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              fullWidth
              required
              multiline
              minRows={2}
            />
            <TextField
              label="상세 설명 (description)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={4}
            />
            <TextField
              label="초기 예치 (표시 단위)"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              helperText="앱 정책: 현재 최소 예치 전액 이상, 단일 denom만 지원합니다."
            />
            <TextField label="Denom" value={denom} onChange={(e) => setDenom(e.target.value)} />
            {amountEntry.confirmation}
            <Button variant="contained" disabled={!canSign || !amountEntry.ready || busy} onClick={() => void onSubmit()}>
              제안 전송
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
