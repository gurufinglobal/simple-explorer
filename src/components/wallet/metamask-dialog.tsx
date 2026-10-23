"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from "@mui/material";
import { discoverMetaMask, type ProviderChoice } from "@/services/wallet/injected-provider";
import { connectExtension } from "@/services/wallet/wallet-lifecycle";
export function MetaMaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("evm");
  const [choices, setChoices] = useState<ProviderChoice[]>([]);
  useEffect(() => { if (open) return discoverMetaMask(setChoices); }, [open]);
  return <Dialog open={open} onClose={onClose} fullWidth><DialogTitle>{t("selectProvider")}</DialogTitle>
    <DialogContent><Stack spacing={2}><Alert severity="info">{t("providerNotice")}</Alert>
      {choices.length === 0 && <Alert severity="warning">{t("noProvider")}</Alert>}
      {choices.map(choice => <Button key={choice.id} onClick={() => { onClose(); void connectExtension("metamask", choice.provider); }}>{choice.name} · {choice.id}</Button>)}
    </Stack></DialogContent><DialogActions><Button onClick={onClose}>{t("cancel")}</Button></DialogActions></Dialog>;
}
