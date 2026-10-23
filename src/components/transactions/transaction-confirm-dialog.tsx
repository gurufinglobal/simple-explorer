"use client";
import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import type { TransactionSnapshot } from "@/services/transactions/transaction";

export function TransactionConfirmDialog({ snapshot, onCancel, onConfirm, onExited }: {
  snapshot: TransactionSnapshot | null; onCancel: () => void; onConfirm: () => void; onExited?: () => void;
}) {
  const t = useTranslations("transaction");
  const st = useServiceText();
  return <Dialog open={snapshot !== null} onClose={onCancel} fullWidth maxWidth="sm"
    slotProps={{ transition: { onExited } }}
    aria-labelledby="transaction-confirm-title" aria-describedby="transaction-confirm-description">
    <DialogTitle id="transaction-confirm-title">{t("review_before_submitting_transaction")}</DialogTitle>
    {snapshot && <DialogContent sx={{ overflowWrap: "anywhere" }}>
      <Stack spacing={1.5} id="transaction-confirm-description">
        <Typography>{t("action")} {st(snapshot.action)}</Typography>
        <Typography>{t("chain")} {snapshot.chainKey} / {snapshot.chainId}</Typography>
        <Typography>{t("signing_account")} {snapshot.sender}</Typography>
        <Typography>{st(snapshot.targetLabel ?? t("full_recipient_address"))}: {snapshot.recipient}</Typography>
        {snapshot.governance?.option && <Typography>{t("vote_option")} {snapshot.governance.option}</Typography>}
        {snapshot.governance?.title && <Typography sx={{ whiteSpace: "pre-wrap" }}>{t("title")} {snapshot.governance.title}</Typography>}
        {snapshot.governance?.summary && <Typography sx={{ whiteSpace: "pre-wrap" }}>{t("summary")} {snapshot.governance.summary}</Typography>}
        {snapshot.governance?.description && <Typography sx={{ whiteSpace: "pre-wrap" }}>{t("body")} {snapshot.governance.description}</Typography>}
        {snapshot.governance?.depositPolicy && <Typography>{st(snapshot.governance.depositPolicy)}</Typography>}
        {snapshot.amount !== undefined && <><Typography>{t("display_amount")} {snapshot.displayAmount} {snapshot.unit}</Typography>
        <Typography>{t("raw_transfer_amount")} {snapshot.amount} {snapshot.denom}</Typography></>}
        {snapshot.observedRewards && <><Typography>{t("withdrawal_message_without_an_amount_rewards_are_determined_during")}</Typography>
          <Typography>{t("observed_rewards_raw_denom_and_fractional_amount_display_metadata")} {snapshot.observedRewards.length ? snapshot.observedRewards.map(c => `${c.amount} ${c.denom}`).join(", ") : t("no_reward_entries")}</Typography></>}
        <Typography>{t("estimated_fees_base_units")} {snapshot.fee.amount.map(c => `${c.amount} ${c.denom}`).join(", ")}</Typography>
        <Typography>{t("gas_limit")} {snapshot.fee.gas}</Typography>
        <Typography variant="body2">{t("estimation_basis")} {st(snapshot.feeBasis)}</Typography>
        <Alert severity="info">{t("no_wallet_signature_has_been_requested_yet_your_wallet")}</Alert>
      </Stack>
    </DialogContent>}
    <DialogActions>
      <Button autoFocus onClick={onCancel}>{t("cancel")}</Button>
      <Button variant="contained" onClick={onConfirm}>{t("confirm_and_request_wallet_signature")}</Button>
    </DialogActions>
  </Dialog>;
}
