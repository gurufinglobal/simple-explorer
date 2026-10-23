"use client";
import { ServiceErrorText } from "@/components/query/service-error-text";

import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";


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
  const t = useTranslations("governance");
  const st = useServiceText();
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
    if (!walletType) throw new Error(t("connect_your_wallet"));
    return prepareGovernanceTx({ walletType, sessionTopic, bech32Address, action: "proposal",
      title: title.trim(), summary: summary.trim(), description: description.trim() || summary.trim(),
      amount: amountEntry.requireBase(), denom, displayAmount: deposit }, assertCurrent);
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
           {t("new_text_proposal")} </Typography>
        <Button component={Link} href="/governance" variant="outlined" size="small">
           {t("list")} </Button>
      </Stack>

      {metamask ? (
        <Alert severity="info">{t("metamask_does_not_support_cosmos_proposal_signing_a_verified")}</Alert>
      ) : null}
      {reason && <Alert severity="info">{st(reason)}</Alert>}
      {flow.error && <Alert severity="warning" role="status">{<ServiceErrorText error={flow.error} />}</Alert>}
      {flow.phase === "validating" && <Alert severity="info" role="status">{t("checking_parameters_authority_balance_and_fees")}</Alert>}
      {flow.phase === "signing" && <Alert severity="info" role="status">{t("waiting_for_wallet_signature")}</Alert>}
      {flow.receipt && <TransactionResult key={`${flow.receipt.hash}:${flow.receipt.status}`} receipt={flow.receipt} />}
      <SavedTransactions chainKey={chain.key} excludeHash={flow.receipt?.hash} />
      <TransactionConfirmDialog onExited={flow.restoreFocus} snapshot={flow.prepared?.snapshot ?? null} onCancel={flow.cancel} onConfirm={() => void flow.confirm()} />

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <TextField label={t("title")} value={title} onChange={(e) => setTitle(e.target.value)} fullWidth required />
            <TextField
              label={t("summary")}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              fullWidth
              required
              multiline
              minRows={2}
            />
            <TextField
              label={t("description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={4}
            />
            <TextField
              label={t("initial_deposit_display_units")}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              helperText={t("app_policy_at_least_the_full_current_minimum_deposit")}
            />
            <TextField label={t("denom")} value={denom} onChange={(e) => setDenom(e.target.value)} />
            {amountEntry.confirmation}
            <Button variant="contained" disabled={!canSign || !amountEntry.ready || busy} onClick={() => void onSubmit()}>
               {t("submit_proposal")} </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
