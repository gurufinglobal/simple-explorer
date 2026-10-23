"use client";
import { ServiceErrorText } from "@/components/query/service-error-text";

import { useServiceText } from "@/i18n/use-service-text";
import { useLocale, useTranslations } from "next-intl";


import { useAmountEntry } from "@/components/amount/amount-entry";
import { CoinAmount } from "@/components/amount/coin-amount";
import { getDenomsMetadata } from "@/services/guru/token-metadata.service";
import Link from "@/components/layout/chain-link";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";
import { useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  LinearProgress,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import type { ChainConfig } from "@/lib/env";
import type { GovParamsBundle, GovTally, NormalizedProposal, VoteOption } from "@/lib/gov-types";
import { formatGovDurationLabel, formatGovRatioPercent } from "@/lib/gov-format";
import { tallyPercentages } from "@/lib/gov-mapper";
import { formatRelativeFutureOrPast } from "@/lib/relative-time";
import { useNowTick } from "@/hooks/use-now-tick";
import type { GovernanceDepositRow, GovernanceVoteRow } from "@/services/guru/governance-query.service";
import { getVoteForVoter } from "@/services/guru/governance-query.service";
import { prepareGovernanceTx, governanceBlockReason } from "@/services/guru/governance-tx.client";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { writeBlockReason } from "@/services/wallet/chain-eligibility";
import { useTransactionFlow } from "@/hooks/use-transaction-flow";
import { TransactionConfirmDialog } from "@/components/transactions/transaction-confirm-dialog";
import { TransactionResult, SavedTransactions } from "@/components/transactions/transaction-result";
import { useWalletSessionStore } from "@/stores/wallet-session.store";



type Props = {
  pinnedChain?: ChainConfig;
  proposal: NormalizedProposal;
  govParams: GovParamsBundle;
  liveTally: GovTally | null;
  votes: GovernanceVoteRow[];
  deposits: GovernanceDepositRow[];
  rawJson: unknown;
  votesControls?: ReactNode;
  votesAvailable?: boolean;
  depositsAvailable?: boolean;
};

function mergeTally(proposal: NormalizedProposal, live: GovTally | null): GovTally {
  if (live) {
    return live;
  }
  return proposal.finalTally;
}

export function GovernanceProposalDetail({
  proposal,
  pinnedChain,
  govParams,
  liveTally,
  votes,
  deposits,
  rawJson,
  votesControls,
  votesAvailable = true,
  depositsAvailable = true,
}: Props) {
  const t = useTranslations("governance");
  const st = useServiceText();
const STATUS_KO: Record<string, string> = {
  deposit_period: t("deposit_period"),
  voting_period: t("voting_period"),
  passed: t("passed"),
  rejected: t("rejected"),
  failed: t("failed"),
  unspecified: t("unknown"),
};

  const locale = useLocale();
  const nowMs = useNowTick(1000);
  const tally = useMemo(() => mergeTally(proposal, liveTally), [proposal, liveTally]);
  const pct = tallyPercentages(tally);
  const {
    walletType,
    bech32Address,
    sessionTopic,
    status: walletStatus,
  } = useWalletSessionStore();

  const [tab, setTab] = useState(0);
  const voteQuery = useQuery(`my-vote:${proposal.id}:${bech32Address}`, client => getVoteForVoter(proposal.id, bech32Address!, client), undefined, walletStatus === "connected" && !!bech32Address, pinnedChain);
  const myVote = voteQuery.result.data;
  const [depositAmount, setDepositAmount] = useState("");

  const denom = govParams.deposit?.minDeposit[0]?.denom ?? "";
  const amountEntry = useAmountEntry(depositAmount, denom);
  const metadata = useQuery("gov-metadata", client => getDenomsMetadata(client), undefined, true, pinnedChain);

  const canSignCosmos = useWalletSessionStore(s => s.status === "connected" && s.writeStatus === "ready");
  const metamaskReadonly = walletStatus === "connected" && walletType === "metamask";

  const chain = getActiveChainConfig();
  const wallet = useWalletSessionStore();
  const periodValid = proposal.status === "voting_period"
    ? nowMs >= Date.parse(proposal.votingStartTime) && nowMs < Date.parse(proposal.votingEndTime)
    : proposal.status === "deposit_period" && nowMs < Date.parse(proposal.depositEndTime);
  const flow = useTransactionFlow(JSON.stringify([chain.key, wallet.generation, proposal.id, depositAmount, denom, amountEntry.base, amountEntry.ready]), JSON.stringify([proposal.status, proposal.votingStartTime, proposal.votingEndTime, proposal.depositEndTime, govParams, periodValid]));
  const blocked = pinnedChain && pinnedChain.key !== chain.key ? t("the_proposal_link_chain_differs_from_your_wallet_chain") : writeBlockReason(chain, wallet);
  const voteReason = blocked ?? governanceBlockReason(chain, "vote", walletType);
  const depositReason = blocked ?? governanceBlockReason(chain, "deposit", walletType);
  const voteBusy = flow.busy || flow.phase === "confirming" || !!voteReason || !periodValid;
  const depositBusy = flow.busy || flow.phase === "confirming" || !!depositReason || !periodValid;
  const onVote = (option: VoteOption) => flow.begin(assertCurrent => {
    if (blocked) throw new Error(blocked);
    if (!walletType) throw new Error(t("connect_your_wallet"));
    return prepareGovernanceTx({ walletType, sessionTopic, bech32Address, action: "vote", proposalId: proposal.id, option }, assertCurrent);
  });
  const onDeposit = () => flow.begin(assertCurrent => {
    if (blocked) throw new Error(blocked);
    if (!walletType) throw new Error(t("connect_your_wallet"));
    return prepareGovernanceTx({ walletType, sessionTopic, bech32Address, action: "deposit", proposalId: proposal.id, amount: amountEntry.requireBase(), denom, displayAmount: depositAmount }, assertCurrent);
  });

  return (
    <Stack spacing={2}>
      <QueryStatus {...voteQuery} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>
           {t("proposal_2")}{proposal.id}
        </Typography>
        <Button component={Link} href="/governance" variant="outlined" size="small">
           {t("list")} </Button>
      </Stack>

      {metamaskReadonly ? (
        <Alert severity="info">
           {t("metamask_does_not_support_cosmos_governance_signing_a_verified")} </Alert>
      ) : null}
      {[...new Set([voteReason, depositReason].filter(Boolean))].map(reason => <Alert key={st(reason)} severity="info">{st(reason)}</Alert>)}
      {!periodValid && (proposal.status === "voting_period" || proposal.status === "deposit_period") && <Alert severity="warning">{t("the_proposal_period_has_ended_or_has_not_started")}</Alert>}
      {flow.error && <Alert severity="warning" role="status">{<ServiceErrorText error={flow.error} />}</Alert>}
      {flow.phase === "validating" && <Alert severity="info" role="status">{t("checking_proposal_period_parameters_balance_and_fees")}</Alert>}
      {flow.phase === "signing" && <Alert severity="info" role="status">{t("waiting_for_wallet_signature")}</Alert>}
      {flow.receipt && <TransactionResult key={`${flow.receipt.hash}:${flow.receipt.status}`} receipt={flow.receipt} />}
      <SavedTransactions chainKey={chain.key} excludeHash={flow.receipt?.hash} />
      <TransactionConfirmDialog onExited={flow.restoreFocus} snapshot={flow.prepared?.snapshot ?? null} onCancel={flow.cancel} onConfirm={() => void flow.confirm()} />

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {proposal.titleMissing ? t("proposalTitle", { id: proposal.id }) : proposal.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
            {proposal.summary}
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Stack spacing={1}>
            <Typography variant="body2">
               {t("status")} {STATUS_KO[proposal.status] ?? proposal.statusRaw}
            </Typography>
            <Typography variant="body2">
               {t("submitted")} {proposal.submitTime ? formatRelativeFutureOrPast(proposal.submitTime, nowMs, locale) : "—"}
            </Typography>
            <Typography variant="body2">
               {t("deposit_deadline")}{" "}
              {proposal.depositEndTime ? formatRelativeFutureOrPast(proposal.depositEndTime, nowMs, locale) : "—"}
            </Typography>
            <Typography variant="body2">
               {t("voting_starts")}{" "}
              {proposal.votingStartTime ? formatRelativeFutureOrPast(proposal.votingStartTime, nowMs, locale) : "—"}
            </Typography>
            <Typography variant="body2">
               {t("voting_ends")}{" "}
              {proposal.votingEndTime ? formatRelativeFutureOrPast(proposal.votingEndTime, nowMs, locale) : "—"}
            </Typography>
            <Typography variant="body2">
               {t("total_deposit")}{" "}
              {proposal.totalDeposit.map(c => <CoinAmount key={c.denom} coin={c} metadata={metadata.result.data ?? []} />)}
            </Typography>
            {bech32Address ? (
              <Typography variant="body2">{t("my_vote")} {myVote ?? "—"}</Typography>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
             {t("vote_results")} </Typography>
          <Stack spacing={1}>
            <Box>
              <Typography variant="caption">{t("yes")} {pct.yes.toFixed(2)}%</Typography>
              <LinearProgress variant="determinate" value={Math.min(100, pct.yes)} />
            </Box>
            <Box>
              <Typography variant="caption">{t("no")} {pct.no.toFixed(2)}%</Typography>
              <LinearProgress color="warning" variant="determinate" value={Math.min(100, pct.no)} />
            </Box>
            <Box>
              <Typography variant="caption">{t("abstain")} {pct.abstain.toFixed(2)}%</Typography>
              <LinearProgress color="inherit" variant="determinate" value={Math.min(100, pct.abstain)} />
            </Box>
            <Box>
              <Typography variant="caption">{t("no_with_veto")} {pct.veto.toFixed(2)}%</Typography>
              <LinearProgress color="error" variant="determinate" value={Math.min(100, pct.veto)} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {!liveTally ? t("live_tally_unavailable_stored_tally_from_proposal_response") : t("live_tally")}  {t("yes_2")} {tally.yes}  {t("abstain_2")} {tally.abstain}  {t("no_2")} {tally.no}  {t("veto")} {tally.noWithVeto}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {govParams.tallying || govParams.voting || govParams.deposit ? (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
               {t("governance_parameters")} </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
               {t("chain_module_parameters_lcd")} <code>/cosmos/gov/v1/params/*</code>  {t("or_v1beta1_fallback")} </Typography>
            <Table size="small">
              <TableBody>
                {govParams.voting?.votingPeriod ? (
                  <TableRow>
                    <TableCell sx={{ width: 200, color: "text.secondary", borderBottom: 1, borderColor: "divider" }}>
                       {t("voting_period_voting_period")} </TableCell>
                    <TableCell sx={{ borderBottom: 1, borderColor: "divider" }}>
                      {formatGovDurationLabel(govParams.voting.votingPeriod, locale)}
                    </TableCell>
                  </TableRow>
                ) : null}
                {govParams.tallying ? (
                  <>
                    <TableRow>
                      <TableCell sx={{ color: "text.secondary", borderBottom: 1, borderColor: "divider" }}>
                         {t("quorum")} </TableCell>
                      <TableCell sx={{ borderBottom: 1, borderColor: "divider" }}>
                        {formatGovRatioPercent(govParams.tallying.quorum)}{" "}
                        <Typography component="span" variant="caption" color="text.secondary">
                           {t("raw")} {govParams.tallying.quorum})
                        </Typography>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: "text.secondary", borderBottom: 1, borderColor: "divider" }}>
                         {t("passing_threshold")} </TableCell>
                      <TableCell sx={{ borderBottom: 1, borderColor: "divider" }}>
                        {formatGovRatioPercent(govParams.tallying.threshold)}{" "}
                        <Typography component="span" variant="caption" color="text.secondary">
                           {t("raw")} {govParams.tallying.threshold})
                        </Typography>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: "text.secondary", borderBottom: 1, borderColor: "divider" }}>
                         {t("veto_threshold")} </TableCell>
                      <TableCell sx={{ borderBottom: 1, borderColor: "divider" }}>
                        {formatGovRatioPercent(govParams.tallying.vetoThreshold)}{" "}
                        <Typography component="span" variant="caption" color="text.secondary">
                           {t("raw")} {govParams.tallying.vetoThreshold})
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </>
                ) : null}
                {govParams.deposit ? (
                  <>
                    <TableRow>
                      <TableCell sx={{ color: "text.secondary", borderBottom: 1, borderColor: "divider" }}>
                         {t("minimum_deposit_min_deposit")} </TableCell>
                      <TableCell sx={{ borderBottom: 1, borderColor: "divider" }}>
                        {govParams.deposit.minDeposit.length > 0
                          ? govParams.deposit.minDeposit.map(c => <CoinAmount key={c.denom} coin={c} metadata={metadata.result.data ?? []} />)
                          : "—"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: "text.secondary", borderBottom: 0 }}>{t("maximum_deposit_period")}</TableCell>
                      <TableCell sx={{ borderBottom: 0 }}>
                        {govParams.deposit.maxDepositPeriod
                          ? formatGovDurationLabel(govParams.deposit.maxDepositPeriod, locale)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  </>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {proposal.status === "voting_period" ? (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
               {t("vote")} </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              <Button disabled={!canSignCosmos || voteBusy} variant="contained" onClick={() => void onVote("yes")}>
                 {t("yes")} </Button>
              <Button disabled={!canSignCosmos || voteBusy} variant="outlined" onClick={() => void onVote("no")}>
                 {t("no")} </Button>
              <Button
                disabled={!canSignCosmos || voteBusy}
                variant="outlined"
                onClick={() => void onVote("abstain")}
              >
                 {t("abstain")} </Button>
              <Button
                disabled={!canSignCosmos || voteBusy}
                variant="outlined"
                color="error"
                onClick={() => void onVote("no_with_veto")}
              >
                 {t("no_with_veto")} </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {proposal.status === "deposit_period" ? (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
               {t("deposit")}{denom})
            </Typography>
            {amountEntry.confirmation}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
              <TextField
                size="small"
                label={t("amount_display_units")}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={!canSignCosmos || depositBusy}
              />
              <Button disabled={!canSignCosmos || !amountEntry.ready || depositBusy} variant="contained" onClick={() => void onDeposit()}>
                 {t("submit_deposit")} </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      <Card variant="outlined">
        <CardContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label={t("vote_records")} />
            <Tab label={t("deposit_records")} />
            <Tab label={t("raw_json")} />
          </Tabs>
          {tab === 0 && votesControls}
          <Box sx={{ mt: 2 }}>
            {tab === 0 ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("address")}</TableCell>
                    <TableCell>{t("option")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!votesAvailable ? <TableRow><TableCell colSpan={2}>{t("vote_records_unknown_check_query_status")}</TableCell></TableRow> : votes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Stack spacing={0.5}>
                          <Typography variant="body2" color="text.secondary">
                             {t("no_voter_records_to_display")} </Typography>
                          <Typography variant="caption" color="text.secondary">
                             {t("there_may_be_no_votes_yet_or_the_proposal")} </Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ) : (
                    votes.map((row, i) => (
                      <TableRow key={`${row.voter}-${i}`}>
                        <TableCell sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>{row.voter}</TableCell>
                        <TableCell>{row.optionDisplay}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            ) : null}
            {tab === 1 ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("depositor")}</TableCell>
                    <TableCell>{t("amount")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!depositsAvailable ? <TableRow><TableCell colSpan={2}>{t("deposit_records_unknown_check_query_status")}</TableCell></TableRow> : deposits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Stack spacing={0.5}>
                          <Typography variant="body2" color="text.secondary">
                             {t("no_deposit_records_to_display")} </Typography>
                          <Typography variant="caption" color="text.secondary">
                             {t("deposits_may_only_be_aggregated_as_a_total_or")} </Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ) : (
                    deposits.map((row, i) => (
                      <TableRow key={`${row.depositor}-${i}`}>
                        <TableCell sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>{row.depositor}</TableCell>
                        <TableCell>{row.coins ? row.coins.map(c => <CoinAmount key={c.denom} coin={c} metadata={metadata.result.data ?? []} />) : row.amountDisplay}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            ) : null}
            {tab === 2 ? (
              <Typography
                component="pre"
                variant="body2"
                sx={{ fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}
              >
                {JSON.stringify(rawJson, null, 2)}
              </Typography>
            ) : null}
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
