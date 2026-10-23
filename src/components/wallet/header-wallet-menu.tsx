"use client";
import { ServiceErrorText } from "@/components/query/service-error-text";

import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";

import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import { Alert, Chip, Divider, IconButton, ListItemText, Menu, MenuItem, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { attachWalletLifecycle, connectExtension, connectQr, disconnectWallet } from "@/services/wallet/wallet-lifecycle";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { getActiveChainConfig } from "@/lib/chain-selection";
import type { WalletConnectMode } from "@/types/walletconnect";
import { getWalletConnectProjectId } from "@/services/wallet/walletconnect-client";
import { WalletConnectQrDialog } from "./walletconnect-qr-dialog";

export function HeaderWalletMenu() {
  const t = useTranslations("wallet");
  const st = useServiceText();
  const state = useWalletSessionStore();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<WalletConnectMode>("cosmos");
  const configured = Boolean(getWalletConnectProjectId());
  const [qr, setQr] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => attachWalletLifecycle(), []);
  useEffect(() => {
    if (state.status === "disconnected") { setQr(false); setUri(null); }
  }, [state.status]);
  let selectedChain = t("chain_configuration_error");
  try { const chain = getActiveChainConfig(); selectedChain = chain.chainId ?? chain.name; } catch {}
  const address = state.bech32Address ?? state.evmAddress;
  const label = state.status === "connected" && address ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : state.status === "connecting" ? t("connecting") : state.status === "error" ? t("error") : t("disconnected");
  const extension = (wallet: "keplr" | "metamask") => { setAnchor(null); void connectExtension(wallet); };
  const startQr = async (mode: WalletConnectMode) => {
    if (useWalletSessionStore.getState().status === "connecting") return;
    setMode(mode); setAnchor(null); setUri(null); setQr(true);
    await connectQr(setUri, mode);
    if (useWalletSessionStore.getState().status === "connected") setQr(false);
  };
  return <>
    <Stack spacing={0.5}>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
        <Chip size="small" label={label} color={state.status === "connected" ? "success" : "default"} />
        <Typography variant="caption">{selectedChain} · {state.writeStatus === "ready" ? t("transactions_enabled") : state.writeStatus === "checking" ? t("checking") : t("read_only")}</Typography>
        <IconButton color="inherit" aria-label={t("wallet_menu")} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={event => setAnchor(event.currentTarget)}><AccountBalanceWalletOutlinedIcon /></IconButton>
      </Stack>
      {state.writeReason && <Typography variant="caption" role="status">{st(state.writeReason)}</Typography>}
    </Stack>
    <Menu slotProps={{ paper: { sx: { overflowWrap: "anywhere" } } }} anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
      {(["cosmos", "keplr", "evm"] as const).map(option => <MenuItem key={option} disabled={!configured || state.status === "connecting"} onClick={() => void startQr(option)}><ListItemText primary={t(`wc_${option}`)} secondary={configured ? t("mobileWallet") : t("wc_not_configured")} /></MenuItem>)}
      <MenuItem disabled={state.status === "connecting"} onClick={() => extension("keplr")}><ListItemText primary="Keplr" /></MenuItem>
      <MenuItem disabled={state.status === "connecting"} onClick={() => extension("metamask")}><ListItemText primary="MetaMask" /></MenuItem>
      <Divider />
      <MenuItem disabled={state.status === "disconnected"} onClick={() => { setAnchor(null); setQr(false); void disconnectWallet(); }}><ListItemText primary={state.status === "connecting" ? t("cancel_connection") : t("disconnect")} /></MenuItem>
      {state.lastError && <Alert severity="error">{<ServiceErrorText error={state.lastError} />}</Alert>}
    </Menu>
    <WalletConnectQrDialog mode={mode} open={qr} uri={uri} error={state.lastError} onClose={() => { setQr(false); setUri(null); void disconnectWallet(); }} />
  </>;
}
