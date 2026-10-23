"use client";
import { ServiceErrorText } from "@/components/query/service-error-text";

import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { validateSendAddress } from "@/lib/send-address";
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
  const t = useTranslations("transaction");
  const st = useServiceText();
  const chain = getActiveChainConfig();
  const wallet = useWalletSessionStore();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [denom, setDenom] = useState(chain.nativeDenom ?? "");
  const entry = useAmountEntry(amount, denom);
  const flow = useTransactionFlow(JSON.stringify([chain.key, wallet.generation, recipient, amount, denom, entry.base, entry.ready]));
  const addressValidation = recipient ? validateSendAddress(recipient, chain.bech32Prefix) : null;
  const blocked = writeBlockReason(chain, wallet) ?? (!chain.sendFeePolicy ? t("no_verified_transfer_fee_policy_sending_is_blocked_because") : null);
  const begin = () => flow.begin(assertCurrent => {
    if (!wallet.walletType) throw new Error(t("connect_your_wallet"));
    return prepareSendTx({ walletType: wallet.walletType, sessionTopic: wallet.sessionTopic, bech32Address: wallet.bech32Address,
      toAddress: recipient, amount: entry.requireBase(), denom, displayAmount: amount }, assertCurrent);
  });
  return <Stack spacing={1} sx={{ mt: 2 }}>
    <Typography variant="subtitle2">{t("send")}</Typography>
    {blocked && <Alert severity="info">{st(blocked)}</Alert>}
    <TextField label={t("recipient_address")} size="small" value={recipient} error={addressValidation?.status === "invalid"} helperText={addressValidation?.message}
      onChange={e => setRecipient(e.target.value.trim())} />
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
      <TextField label={t("amount_display_units")} size="small" value={amount} onChange={e => setAmount(e.target.value.trim())} fullWidth />
      <TextField label={t("denom")} size="small" value={denom} onChange={e => setDenom(e.target.value.trim())} sx={{ minWidth: 140 }} />
    </Stack>
    {entry.confirmation}
    <Button variant="contained" color="info" onClick={() => void begin()}
      disabled={!!blocked || !entry.ready || addressValidation?.status !== "valid" || flow.busy || flow.phase === "confirming"}>
      {flow.phase === "validating" ? t("checking_balance_and_fees") : t("send_2")}
    </Button>
    {flow.error && <Alert severity="warning" role="status">{<ServiceErrorText error={flow.error} />}</Alert>}
    {flow.phase === "signing" && <Alert severity="info" role="status">{t("waiting_for_wallet_signature_changing_input_or_account_invalidates")}</Alert>}
    {flow.receipt && <TransactionResult key={`${flow.receipt.hash}:${flow.receipt.status}`} receipt={flow.receipt} />}
    <TransactionConfirmDialog onExited={flow.restoreFocus} snapshot={flow.prepared?.snapshot ?? null} onCancel={flow.cancel} onConfirm={() => void flow.confirm()} />
  </Stack>;
}
