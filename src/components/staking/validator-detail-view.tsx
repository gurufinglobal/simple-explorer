"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";
import { useMemo } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useNowTick } from "@/hooks/use-now-tick";
import { useEffectiveCosmosAddress } from "@/hooks/use-effective-cosmos-address";
import { CoinAmount } from "@/components/amount/coin-amount";
import { UnbondingDetails } from "@/components/amount/unbonding-details";
import { formatRelativeFutureOrPast } from "@/lib/relative-time";
import {
  getDelegatorValidatorPosition,
  type DelegatorValidatorPosition,
  type ValidatorDetail,
} from "@/services/guru/staking.service";
import { StakingForm } from "@/components/transactions/staking-form";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

type Props = {
  detail: ValidatorDetail;
};

function statusLabel(status: string): string {
  return status
    .replace("BOND_STATUS_", "")
    .toLowerCase()
    .replaceAll("_", " ");
}

function formatCommissionPercent(rate: string): string {
  const parsed = Number(rate);
  if (Number.isNaN(parsed)) return "-";
  return `${(parsed * 100).toFixed(2)}%`;
}

function monospace() {
  return { fontFamily: "monospace", wordBreak: "break-all" as const };
}

const EMPTY_POSITION: DelegatorValidatorPosition = {
  delegationAmount: "-",
  unbondingAmount: "-",
  rewardAmount: "-",
  isOperator: false,
};

export function ValidatorDetailView({ detail }: Props) {
  const nowMs = useNowTick(1000);
  const { status, walletType } = useWalletSessionStore();
  const effectiveAddress = useEffectiveCosmosAddress();
  const isMetamask = status === "connected" && walletType === "metamask";

  const positionQuery = useQuery(`delegator:${effectiveAddress}:${detail.operatorAddress}`, client => getDelegatorValidatorPosition(effectiveAddress!, detail.operatorAddress, client), undefined, status === "connected" && !!effectiveAddress);
  const position = positionQuery.result.data ?? EMPTY_POSITION;
  const positionLoading = positionQuery.busy && !positionQuery.result.data;
  const unbondingRelative = useMemo(
    () => (detail.unbondingTime ? formatRelativeFutureOrPast(detail.unbondingTime, nowMs) : "-"),
    [detail.unbondingTime, nowMs],
  );

  const formatRawTokenAmount = (value: string) => value === "-" ? "미확인" : <CoinAmount coin={{ amount: value, denom: detail.bondDenom ?? "bond denom 미확인" }} metadata={detail.metadata} />;
  const renderAmount = (key: string, value: string, source: typeof detail | typeof position) => source.amountCoins?.[key]
    ? source.amountCoins[key].length ? source.amountCoins[key].map(coin => <CoinAmount key={coin.denom} coin={coin} metadata={source.metadata} />) : "보유 항목 없음"
    : formatRawTokenAmount(value);
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          Validator 상세
        </Typography>
        <Button component={Link} href="/staking" variant="outlined" size="small">
          목록
        </Button>
      </Stack>

      {isMetamask ? (
        <Alert severity="info">MetaMask는 Cosmos staking 서명을 지원하지 않습니다. Keplr 또는 WalletConnect를 사용하세요.</Alert>
      ) : null}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="subtitle1" fontWeight={700}>
              기본 정보
            </Typography>
            <Typography variant="body2">
              <strong>Moniker:</strong> {detail.moniker}
            </Typography>
            <Typography variant="body2">
              <strong>Operator Address:</strong>{" "}
              <Typography component="span" variant="body2" sx={monospace()}>
                {detail.operatorAddress}
              </Typography>
            </Typography>
            <Typography variant="body2">
              <strong>Operator Account:</strong>{" "}
              <Typography component="span" variant="body2" sx={monospace()}>
                {detail.operatorAccountAddress}
              </Typography>
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">
                <strong>Status:</strong>
              </Typography>
              <Chip size="small" label={detail.jailed ? "jailed" : statusLabel(detail.status)} color={detail.jailed ? "warning" : "success"} />
            </Stack>
            <Typography variant="body2">
              <strong>Description:</strong> {detail.details || "-"}
            </Typography>
            <Typography variant="body2">
              <strong>Website:</strong> {detail.website || "-"}
            </Typography>
            <Typography variant="body2">
              <strong>Identity:</strong> {detail.identity || "-"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="subtitle1" fontWeight={700}>
              스테이킹 지표
            </Typography>
            <Typography variant="body2">
              <strong>Voting Power:</strong> {formatRawTokenAmount(detail.votingPower)}
            </Typography>
            <Typography variant="body2">
              <strong>Total Delegation:</strong> {renderAmount("totalDelegationAmount", detail.totalDelegationAmount, detail)}
            </Typography>
            <Typography variant="body2">
              <strong>Self Delegation:</strong> {renderAmount("selfDelegationAmount", detail.selfDelegationAmount, detail)}
            </Typography>
            <Typography variant="body2">
              <strong>Delegator Shares:</strong> {detail.delegatorShares}
            </Typography>
            <Typography variant="body2">
              <strong>Commission Rate:</strong> {formatCommissionPercent(detail.commission)}
            </Typography>
            <Typography variant="body2">
              <strong>Outstanding Rewards:</strong> {renderAmount("outstandingRewardsAmount", detail.outstandingRewardsAmount, detail)}
            </Typography>
            <Typography variant="body2">
              <strong>Commission Rewards:</strong> {renderAmount("commissionRewardsAmount", detail.commissionRewardsAmount, detail)}
            </Typography>
            <Typography variant="body2">
              <strong>Min Self Delegation:</strong> {formatRawTokenAmount(detail.minSelfDelegation)}
            </Typography>
            <Typography variant="body2">
              <strong>Unbonding Height:</strong> {detail.unbondingHeight}
            </Typography>
            <Typography variant="body2">
              <strong>Unbonding Time:</strong> {detail.unbondingTime || "-"} {detail.unbondingTime ? `(${unbondingRelative})` : ""}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={700}>
              내 포지션 및 액션
            </Typography>
            <Typography variant="body2" color="text.secondary">
              현재 지갑: {effectiveAddress ?? "미연결"}
            </Typography>
            <QueryStatus {...positionQuery} />
            {positionLoading ? (
              <Stack spacing={0.5}>
                <Skeleton variant="text" width={180} />
                <Skeleton variant="text" width={170} />
                <Skeleton variant="text" width={160} />
              </Stack>
            ) : null}
            <Typography variant="body2">
              <strong>My Delegation:</strong> {renderAmount("delegationAmount", position.delegationAmount, position)}
            </Typography>
            <Typography variant="body2">
              <strong>My Unbonding:</strong> {renderAmount("unbondingAmount", position.unbondingAmount, position)}
            </Typography>
            <Typography variant="body2">
              <strong>My Reward:</strong> {renderAmount("rewardAmount", position.rewardAmount, position)}
            </Typography>
            <Typography variant="body2">
              <strong>Operator Wallet:</strong> {position.isOperator ? "Yes" : "No"}
            </Typography>
            {position.unbondingSnapshot && <UnbondingDetails snapshot={position.unbondingSnapshot} duration={position.unbondingDuration} metadata={position.metadata} />}
            <Divider />
            <StakingForm validatorAddress={detail.operatorAddress} isOperator={positionQuery.result.status === "success" && position.isOperator} />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
