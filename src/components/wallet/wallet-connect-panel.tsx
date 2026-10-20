"use client";
import { Alert, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { connectExtension, disconnectWallet } from "@/services/wallet/wallet-lifecycle";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
export function WalletConnectPanel() {
  const state = useWalletSessionStore();
  return <Card variant="outlined"><CardContent><Stack spacing={2}>
    <Typography variant="h6">지갑 연결</Typography>
    <Chip label={state.status} />
    <Typography>Bech32: {state.bech32Address ?? "-"}</Typography>
    <Typography>EVM: {state.evmAddress ?? "-"}</Typography>
    <Typography>{state.writeReason ?? "쓰기 가능"}</Typography>
    <Stack direction="row" spacing={1}>
      <Button disabled={state.status === "connecting"} onClick={() => void connectExtension("keplr")}>Keplr 연결</Button>
      <Button disabled={state.status === "connecting"} onClick={() => void connectExtension("metamask")}>MetaMask 연결</Button>
      <Button onClick={() => void disconnectWallet()}>연결 해제</Button>
    </Stack>
    {state.lastError && <Alert severity="error">{state.lastError}</Alert>}
  </Stack></CardContent></Card>;
}
