"use client";
import { useState } from "react";
import { MetaMaskDialog } from "./metamask-dialog";
import { ServiceErrorText } from "@/components/query/service-error-text";

import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";

import { Alert, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { connectExtension, disconnectWallet } from "@/services/wallet/wallet-lifecycle";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
export function WalletConnectPanel() {
  const [metamask, setMetamask] = useState(false);
  const t = useTranslations("wallet");
  const st = useServiceText();
  const et = useTranslations("evm");
  const state = useWalletSessionStore();
  return <Card variant="outlined"><CardContent><Stack spacing={2}>
    <Typography variant="h6">{t("connect_wallet")}</Typography>
    <Chip label={t(state.status)} />
    <Typography>{t("bech32")} {state.bech32Address ?? "-"}</Typography>
    <Typography>{t("evm")} {state.evmAddress ?? "-"}</Typography>
    <Typography>{state.status === "connected" && (state.walletType === "metamask" || state.wcMode === "evm") ? et("cosmosBlocked") : st(state.writeReason ?? t("transactions_enabled"))}</Typography>
    <Stack direction="row" spacing={1}>
      <Button disabled={state.status === "connecting"} onClick={() => void connectExtension("keplr")}>{t("connect_keplr")}</Button>
      <Button disabled={state.status === "connecting"} onClick={() => setMetamask(true)}>{t("connect_metamask")}</Button>
      <Button onClick={() => void disconnectWallet()}>{t("disconnect")}</Button>
    </Stack>
    {state.lastError && <Alert severity="error">{<ServiceErrorText error={state.lastError} />}</Alert>}
    <MetaMaskDialog open={metamask} onClose={() => setMetamask(false)} />
  </Stack></CardContent></Card>;
}
