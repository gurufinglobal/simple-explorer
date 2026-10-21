"use client";

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

const STATUS_KO: Record<string, string> = {
  deposit_period: "예치 기간",
  voting_period: "투표 기간",
  passed: "가결",
  rejected: "부결",
  failed: "실패",
  unspecified: "알 수 없음",
};

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
  const blocked = pinnedChain && pinnedChain.key !== chain.key ? "제안 링크의 체인과 선택한 지갑 체인이 다릅니다. 해당 체인으로 전환하세요." : writeBlockReason(chain, wallet);
  const voteReason = blocked ?? governanceBlockReason(chain, "vote", walletType);
  const depositReason = blocked ?? governanceBlockReason(chain, "deposit", walletType);
  const voteBusy = flow.busy || flow.phase === "confirming" || !!voteReason || !periodValid;
  const depositBusy = flow.busy || flow.phase === "confirming" || !!depositReason || !periodValid;
  const onVote = (option: VoteOption) => flow.begin(assertCurrent => {
    if (blocked) throw new Error(blocked);
    if (!walletType) throw new Error("지갑을 연결하세요.");
    return prepareGovernanceTx({ walletType, sessionTopic, bech32Address, action: "vote", proposalId: proposal.id, option }, assertCurrent);
  });
  const onDeposit = () => flow.begin(assertCurrent => {
    if (blocked) throw new Error(blocked);
    if (!walletType) throw new Error("지갑을 연결하세요.");
    return prepareGovernanceTx({ walletType, sessionTopic, bech32Address, action: "deposit", proposalId: proposal.id, amount: amountEntry.requireBase(), denom, displayAmount: depositAmount }, assertCurrent);
  });

  return (
    <Stack spacing={2}>
      <QueryStatus {...voteQuery} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>
          제안 #{proposal.id}
        </Typography>
        <Button component={Link} href="/governance" variant="outlined" size="small">
          목록
        </Button>
      </Stack>

      {metamaskReadonly ? (
        <Alert severity="info">
          MetaMask는 Cosmos 거버넌스 서명을 지원하지 않습니다. 검증된 Keplr Direct 서명 설정이 필요합니다.
        </Alert>
      ) : null}
      {[...new Set([voteReason, depositReason].filter(Boolean))].map(reason => <Alert key={reason} severity="info">{reason}</Alert>)}
      {!periodValid && (proposal.status === "voting_period" || proposal.status === "deposit_period") && <Alert severity="warning">제안 기간이 종료되었거나 아직 시작되지 않았습니다. 기간 미확인 시에도 전송을 차단합니다.</Alert>}
      {flow.error && <Alert severity="warning" role="status">{flow.error}</Alert>}
      {flow.phase === "validating" && <Alert severity="info" role="status">제안 기간·params·잔액·수수료 확인 중</Alert>}
      {flow.phase === "signing" && <Alert severity="info" role="status">지갑 서명 대기 중</Alert>}
      {flow.receipt && <TransactionResult key={`${flow.receipt.hash}:${flow.receipt.status}`} receipt={flow.receipt} />}
      <SavedTransactions chainKey={chain.key} excludeHash={flow.receipt?.hash} />
      <TransactionConfirmDialog onExited={flow.restoreFocus} snapshot={flow.prepared?.snapshot ?? null} onCancel={flow.cancel} onConfirm={() => void flow.confirm()} />

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {proposal.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
            {proposal.summary}
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Stack spacing={1}>
            <Typography variant="body2">
              상태: {STATUS_KO[proposal.status] ?? proposal.statusRaw}
            </Typography>
            <Typography variant="body2">
              제출: {proposal.submitTime ? formatRelativeFutureOrPast(proposal.submitTime, nowMs) : "—"}
            </Typography>
            <Typography variant="body2">
              예치 마감:{" "}
              {proposal.depositEndTime ? formatRelativeFutureOrPast(proposal.depositEndTime, nowMs) : "—"}
            </Typography>
            <Typography variant="body2">
              투표 시작:{" "}
              {proposal.votingStartTime ? formatRelativeFutureOrPast(proposal.votingStartTime, nowMs) : "—"}
            </Typography>
            <Typography variant="body2">
              투표 마감:{" "}
              {proposal.votingEndTime ? formatRelativeFutureOrPast(proposal.votingEndTime, nowMs) : "—"}
            </Typography>
            <Typography variant="body2">
              총 예치:{" "}
              {proposal.totalDeposit.map(c => <CoinAmount key={c.denom} coin={c} metadata={metadata.result.data ?? []} />)}
            </Typography>
            {bech32Address ? (
              <Typography variant="body2">내 투표: {myVote ?? "—"}</Typography>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            투표 결과
          </Typography>
          <Stack spacing={1}>
            <Box>
              <Typography variant="caption">Yes {pct.yes.toFixed(2)}%</Typography>
              <LinearProgress variant="determinate" value={Math.min(100, pct.yes)} />
            </Box>
            <Box>
              <Typography variant="caption">No {pct.no.toFixed(2)}%</Typography>
              <LinearProgress color="warning" variant="determinate" value={Math.min(100, pct.no)} />
            </Box>
            <Box>
              <Typography variant="caption">Abstain {pct.abstain.toFixed(2)}%</Typography>
              <LinearProgress color="inherit" variant="determinate" value={Math.min(100, pct.abstain)} />
            </Box>
            <Box>
              <Typography variant="caption">No with veto {pct.veto.toFixed(2)}%</Typography>
              <LinearProgress color="error" variant="determinate" value={Math.min(100, pct.veto)} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {!liveTally ? "실시간 집계 미확인 · 제안 응답의 저장된 집계: " : "실시간 집계: "} Yes: {tally.yes} Abstain: {tally.abstain} No: {tally.no} Veto: {tally.noWithVeto}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {govParams.tallying || govParams.voting || govParams.deposit ? (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
              거버넌스 파라미터
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              체인 모듈 파라미터 (LCD <code>/cosmos/gov/v1/params/*</code> 또는 v1beta1 대체)
            </Typography>
            <Table size="small">
              <TableBody>
                {govParams.voting?.votingPeriod ? (
                  <TableRow>
                    <TableCell sx={{ width: 200, color: "text.secondary", borderBottom: 1, borderColor: "divider" }}>
                      투표 기간 (voting_period)
                    </TableCell>
                    <TableCell sx={{ borderBottom: 1, borderColor: "divider" }}>
                      {formatGovDurationLabel(govParams.voting.votingPeriod)}
                    </TableCell>
                  </TableRow>
                ) : null}
                {govParams.tallying ? (
                  <>
                    <TableRow>
                      <TableCell sx={{ color: "text.secondary", borderBottom: 1, borderColor: "divider" }}>
                        정족수 (quorum)
                      </TableCell>
                      <TableCell sx={{ borderBottom: 1, borderColor: "divider" }}>
                        {formatGovRatioPercent(govParams.tallying.quorum)}{" "}
                        <Typography component="span" variant="caption" color="text.secondary">
                          (원문 {govParams.tallying.quorum})
                        </Typography>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: "text.secondary", borderBottom: 1, borderColor: "divider" }}>
                        가결 임계값 (threshold)
                      </TableCell>
                      <TableCell sx={{ borderBottom: 1, borderColor: "divider" }}>
                        {formatGovRatioPercent(govParams.tallying.threshold)}{" "}
                        <Typography component="span" variant="caption" color="text.secondary">
                          (원문 {govParams.tallying.threshold})
                        </Typography>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: "text.secondary", borderBottom: 1, borderColor: "divider" }}>
                        거부권(veto) 임계값
                      </TableCell>
                      <TableCell sx={{ borderBottom: 1, borderColor: "divider" }}>
                        {formatGovRatioPercent(govParams.tallying.vetoThreshold)}{" "}
                        <Typography component="span" variant="caption" color="text.secondary">
                          (원문 {govParams.tallying.vetoThreshold})
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </>
                ) : null}
                {govParams.deposit ? (
                  <>
                    <TableRow>
                      <TableCell sx={{ color: "text.secondary", borderBottom: 1, borderColor: "divider" }}>
                        최소 예치 (min_deposit)
                      </TableCell>
                      <TableCell sx={{ borderBottom: 1, borderColor: "divider" }}>
                        {govParams.deposit.minDeposit.length > 0
                          ? govParams.deposit.minDeposit.map(c => <CoinAmount key={c.denom} coin={c} metadata={metadata.result.data ?? []} />)
                          : "—"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: "text.secondary", borderBottom: 0 }}>최대 예치 기간</TableCell>
                      <TableCell sx={{ borderBottom: 0 }}>
                        {govParams.deposit.maxDepositPeriod
                          ? formatGovDurationLabel(govParams.deposit.maxDepositPeriod)
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
              투표하기
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              <Button disabled={!canSignCosmos || voteBusy} variant="contained" onClick={() => void onVote("yes")}>
                Yes
              </Button>
              <Button disabled={!canSignCosmos || voteBusy} variant="outlined" onClick={() => void onVote("no")}>
                No
              </Button>
              <Button
                disabled={!canSignCosmos || voteBusy}
                variant="outlined"
                onClick={() => void onVote("abstain")}
              >
                Abstain
              </Button>
              <Button
                disabled={!canSignCosmos || voteBusy}
                variant="outlined"
                color="error"
                onClick={() => void onVote("no_with_veto")}
              >
                No with veto
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {proposal.status === "deposit_period" ? (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              예치하기 ({denom})
            </Typography>
            {amountEntry.confirmation}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
              <TextField
                size="small"
                label="수량 (표시 단위)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={!canSignCosmos || depositBusy}
              />
              <Button disabled={!canSignCosmos || !amountEntry.ready || depositBusy} variant="contained" onClick={() => void onDeposit()}>
                예치 전송
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      <Card variant="outlined">
        <CardContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="투표 내역" />
            <Tab label="예치 내역" />
            <Tab label="Raw JSON" />
          </Tabs>
          {tab === 0 && votesControls}
          <Box sx={{ mt: 2 }}>
            {tab === 0 ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>주소</TableCell>
                    <TableCell>선택</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!votesAvailable ? <TableRow><TableCell colSpan={2}>투표 내역 미확인: 조회 상태를 확인하세요.</TableCell></TableRow> : votes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Stack spacing={0.5}>
                          <Typography variant="body2" color="text.secondary">
                            표시할 투표자 레코드가 없습니다.
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            아직 아무도 투표하지 않았거나, 예치 단계에서는 투표가 없을 수 있습니다. 투표가 있으면 LCD
                            응답에 포함되며, 현재 조회한 범위와 추가 페이지 여부는 투표 목록의 조회 안내를 확인하세요.
                          </Typography>
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
                    <TableCell>예치자</TableCell>
                    <TableCell>금액</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!depositsAvailable ? <TableRow><TableCell colSpan={2}>예치 내역 미확인: 조회 상태를 확인하세요.</TableCell></TableRow> : deposits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Stack spacing={0.5}>
                          <Typography variant="body2" color="text.secondary">
                            표시할 예치 레코드가 없습니다.
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            예치가 총액으로만 집계되었거나 아직 예치 트랜잭션이 없을 수 있습니다. Raw JSON 탭에서
                            total_deposit 등을 확인할 수 있습니다.
                          </Typography>
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
