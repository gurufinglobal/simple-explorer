"use client";

import { useState } from "react";
import { Alert, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { connectWallet } from "@/services/wallet/wallet-connector";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

export function WalletConnectPanel() {
  const { status, bech32Address, evmAddress, walletType, connect, disconnect, startConnecting } =
    useWalletSessionStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"keplr" | "metamask" | null>(null);

  async function onConnect(targetWallet: "keplr" | "metamask") {
    try {
      setLoading(targetWallet);
      setError(null);
      startConnecting();
      const result = await connectWallet(targetWallet);
      connect(result.walletType, result.bech32Address, result.evmAddress, {
        sessionTopic: result.sessionTopic,
        connectedChains: result.connectedChains,
      });
    } catch {
      setError("지갑 연결에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">지갑 연결</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">상태:</Typography>
            <Chip label={status} size="small" color={status === "connected" ? "success" : "default"} />
            {walletType ? <Chip label={walletType} size="small" /> : null}
          </Stack>
          <Typography variant="body2">Bech32: {bech32Address ?? "-"}</Typography>
          <Typography variant="body2">EVM: {evmAddress ?? "-"}</Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => void onConnect("keplr")}
              disabled={loading !== null}
            >
              {loading === "keplr" ? "Keplr 연결 중..." : "Keplr 연결"}
            </Button>
            <Button
              variant="contained"
              onClick={() => void onConnect("metamask")}
              disabled={loading !== null}
            >
              {loading === "metamask" ? "MetaMask 연결 중..." : "MetaMask 연결"}
            </Button>
            <Button variant="outlined" onClick={disconnect}>
              연결 해제
            </Button>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
