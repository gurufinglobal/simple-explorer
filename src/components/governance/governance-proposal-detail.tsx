"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";
import { useMemo, useState } from "react";
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
import type { GovParamsBundle, GovTally, NormalizedProposal, VoteOption } from "@/lib/gov-types";
import { formatGovDurationLabel, formatGovRatioPercent } from "@/lib/gov-format";
import { tallyPercentages } from "@/lib/gov-mapper";
import { formatRelativeFutureOrPast } from "@/lib/relative-time";
import { useNowTick } from "@/hooks/use-now-tick";
import type { GovernanceDepositRow, GovernanceVoteRow } from "@/services/guru/governance-query.service";
import { getVoteForVoter } from "@/services/guru/governance-query.service";
import {
  submitGovernanceDepositTx,
  submitGovernanceVoteTx,
} from "@/services/guru/governance-tx.client";
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
  proposal: NormalizedProposal;
  govParams: GovParamsBundle;
  liveTally: GovTally | null;
  votes: GovernanceVoteRow[];
  deposits: GovernanceDepositRow[];
  rawJson: unknown;
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
  govParams,
  liveTally,
  votes,
  deposits,
  rawJson,
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
  const voteQuery = useQuery(`my-vote:${proposal.id}:${bech32Address}`, client => getVoteForVoter(proposal.id, bech32Address!, client), undefined, walletStatus === "connected" && !!bech32Address);
  const myVote = voteQuery.result.data;
  const loadMyVote = voteQuery.refresh;
  const [voteBusy, setVoteBusy] = useState(false);
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const denom = proposal.totalDeposit[0]?.denom ?? "agxn";

  const canSignCosmos = useWalletSessionStore(s => s.status === "connected" && s.writeStatus === "ready");
  const metamaskReadonly = walletStatus === "connected" && walletType === "metamask";

  const onVote = async (option: VoteOption) => {
    if (!canSignCosmos || !walletType) {
      setError("Keplr 또는 WalletConnect로 Cosmos 주소를 연결하세요.");
      return;
    }
    setError(null);
    setSuccess(null);
    setVoteBusy(true);
    try {
      const { txHash } = await submitGovernanceVoteTx({
        walletType,
        sessionTopic,
        bech32Address,
        proposalId: proposal.id,
        option,
      });
      setSuccess(`투표가 전송되었습니다. Tx: ${txHash}`);
      await loadMyVote();
    } catch (e) {
      setError(e instanceof Error ? e.message : "투표에 실패했습니다.");
    } finally {
      setVoteBusy(false);
    }
  };

  const onDeposit = async () => {
    if (!canSignCosmos || !walletType) {
      setError("Keplr 또는 WalletConnect로 Cosmos 주소를 연결하세요.");
      return;
    }
    if (!/^[0-9]+$/.test(depositAmount.trim())) {
      setError("예치 수량은 정수 문자열이어야 합니다.");
      return;
    }
    setError(null);
    setSuccess(null);
    setDepositBusy(true);
    try {
      const { txHash } = await submitGovernanceDepositTx({
        walletType,
        sessionTopic,
        bech32Address,
        proposalId: proposal.id,
        amount: depositAmount.trim(),
        denom,
      });
      setSuccess(`예치 트랜잭션이 전송되었습니다. Tx: ${txHash}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "예치에 실패했습니다.");
    } finally {
      setDepositBusy(false);
    }
  };

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
          MetaMask는 Cosmos 거버넌스 서명을 지원하지 않습니다. 투표·예치는 Keplr 또는 WalletConnect를 사용하세요.
        </Alert>
      ) : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

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
              {proposal.totalDeposit.map((c) => `${c.amount} ${c.denom}`).join(", ") || "—"}
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
                          ? govParams.deposit.minDeposit.map((c) => `${c.amount} ${c.denom}`).join(", ")
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
              <TextField
                size="small"
                label="수량 (최소 단위)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={!canSignCosmos || depositBusy}
              />
              <Button disabled={!canSignCosmos || depositBusy} variant="contained" onClick={() => void onDeposit()}>
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
                            응답에 포함되며, 이 목록은 최대 200건까지 불러옵니다 (추가 페이지는 미구현).
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
                        <TableCell>{row.amountDisplay}</TableCell>
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
