"use client";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import { Alert, Chip, Divider, IconButton, ListItemText, Menu, MenuItem, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { attachWalletLifecycle, connectExtension, connectQr, disconnectWallet } from "@/services/wallet/wallet-lifecycle";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { WalletConnectQrDialog } from "./walletconnect-qr-dialog";

export function HeaderWalletMenu() {
  const state = useWalletSessionStore();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [qr, setQr] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => attachWalletLifecycle(), []);
  useEffect(() => {
    if (state.status === "disconnected") { setQr(false); setUri(null); }
  }, [state.status]);
  let selectedChain = "체인 설정 오류";
  try { const chain = getActiveChainConfig(); selectedChain = chain.chainId ?? chain.name; } catch {}
  const address = state.bech32Address ?? state.evmAddress;
  const label = state.status === "connected" && address ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : state.status === "connecting" ? "Connecting" : state.status === "error" ? "Error" : "Disconnected";
  const extension = (wallet: "keplr" | "metamask") => { setAnchor(null); void connectExtension(wallet); };
  const startQr = async () => {
    if (useWalletSessionStore.getState().status === "connecting") return;
    setAnchor(null); setUri(null); setQr(true);
    await connectQr(setUri);
    if (useWalletSessionStore.getState().status === "connected") setQr(false);
  };
  return <>
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip size="small" label={label} color={state.status === "connected" ? "success" : "default"} />
        <Typography variant="caption">{selectedChain} · {state.writeStatus === "ready" ? "쓰기 가능" : state.writeStatus === "checking" ? "확인 중" : "조회 전용"}</Typography>
        <IconButton color="inherit" aria-label="wallet menu" onClick={event => setAnchor(event.currentTarget)}><AccountBalanceWalletOutlinedIcon /></IconButton>
      </Stack>
      {state.writeReason && <Typography variant="caption" role="status">{state.writeReason}</Typography>}
    </Stack>
    <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
      <MenuItem disabled={state.status === "connecting"} onClick={() => void startQr()}><ListItemText primary="WalletConnect" secondary="QR / mobile wallet" /></MenuItem>
      <MenuItem disabled={state.status === "connecting"} onClick={() => extension("keplr")}><ListItemText primary="Keplr" /></MenuItem>
      <MenuItem disabled={state.status === "connecting"} onClick={() => extension("metamask")}><ListItemText primary="MetaMask" /></MenuItem>
      <Divider />
      <MenuItem disabled={state.status === "disconnected"} onClick={() => { setAnchor(null); setQr(false); void disconnectWallet(); }}><ListItemText primary={state.status === "connecting" ? "Cancel connection" : "Disconnect"} /></MenuItem>
      {state.lastError && <Alert severity="error">{state.lastError}</Alert>}
    </Menu>
    <WalletConnectQrDialog open={qr} uri={uri} error={state.lastError} onClose={() => { setQr(false); setUri(null); void disconnectWallet(); }} />
  </>;
}
