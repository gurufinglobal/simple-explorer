"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { submitTextProposalTx } from "@/services/guru/governance-tx.client";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSign = status === "connected" && (walletType === "keplr" || walletType === "walletconnect");
  const metamask = status === "connected" && walletType === "metamask";

  const onSubmit = async () => {
    if (!canSign || !walletType) {
      setError("Keplr 또는 WalletConnect로 연결하세요.");
      return;
    }
    if (!title.trim() || !summary.trim()) {
      setError("제목과 요약은 필수입니다.");
      return;
    }
    if (!/^[0-9]+$/.test(deposit.trim())) {
      setError("예치금은 최소 단위 정수 문자열이어야 합니다.");
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const { txHash } = await submitTextProposalTx({
        walletType,
        sessionTopic,
        bech32Address,
        title: title.trim(),
        summary: summary.trim(),
        description: description.trim() || summary.trim(),
        initialDepositAmount: deposit.trim(),
        denom: denom.trim() || defaultDenom,
      });
      setSuccess(`제안이 전송되었습니다. Tx: ${txHash}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "제안 전송에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

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
        <Alert severity="info">MetaMask는 Cosmos 제안 서명을 지원하지 않습니다. Keplr 또는 WalletConnect를 사용하세요.</Alert>
      ) : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

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
              label="초기 예치 (최소 단위)"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              helperText="체인 최소 예치 요건을 충족해야 합니다."
            />
            <TextField label="Denom" value={denom} onChange={(e) => setDenom(e.target.value)} />
            <Button variant="contained" disabled={!canSign || busy} onClick={() => void onSubmit()}>
              제안 전송
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
