"use client";
import { LocalizedTime } from "@/components/explorer/localized-time";
import { useLocale, useTranslations } from "next-intl";


import Link from "@/components/layout/chain-link";
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
  const t = useTranslations("staking");
  const locale = useLocale();
  const nowMs = useNowTick(1000);
  const { status, walletType } = useWalletSessionStore();
  const effectiveAddress = useEffectiveCosmosAddress();
  const isMetamask = status === "connected" && walletType === "metamask";

  const positionQuery = useQuery(`delegator:${effectiveAddress}:${detail.operatorAddress}`, client => getDelegatorValidatorPosition(effectiveAddress!, detail.operatorAddress, client), undefined, status === "connected" && !!effectiveAddress);
  const position = positionQuery.result.data ?? EMPTY_POSITION;
  const positionLoading = positionQuery.busy && !positionQuery.result.data;
  const unbondingRelative = useMemo(
    () => (detail.unbondingTime ? formatRelativeFutureOrPast(detail.unbondingTime, nowMs, locale) : "-"),
    [detail.unbondingTime, nowMs, locale],
  );

  const formatRawTokenAmount = (value: string) => value === "-" ? t("unknown") : <CoinAmount coin={{ amount: value, denom: detail.bondDenom ?? t("bond_denom_unknown") }} metadata={detail.metadata} />;
  const renderAmount = (key: string, value: string, source: typeof detail | typeof position) => source.amountCoins?.[key]
    ? source.amountCoins[key].length ? source.amountCoins[key].map(coin => <CoinAmount key={coin.denom} coin={coin} metadata={source.metadata} />) : t("no_holdings")
    : formatRawTokenAmount(value);
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
           {t("validator_details")} </Typography>
        <Button component={Link} href="/staking" variant="outlined" size="small">
           {t("list")} </Button>
      </Stack>

      {isMetamask ? (
        <Alert severity="info">{t("metamask_does_not_support_cosmos_staking_signing_use_keplr")}</Alert>
      ) : null}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="subtitle1" fontWeight={700}>
               {t("basic_information")} </Typography>
            <Typography variant="body2">
              <strong>{t("moniker")}</strong> {detail.moniker}
            </Typography>
            <Typography variant="body2">
              <strong>{t("operator_address")}</strong>{" "}
              <Typography component="span" variant="body2" sx={monospace()}>
                {detail.operatorAddress}
              </Typography>
            </Typography>
            <Typography variant="body2">
              <strong>{t("operator_account")}</strong>{" "}
              <Typography component="span" variant="body2" sx={monospace()}>
                {detail.operatorAccountAddress}
              </Typography>
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">
                <strong>{t("status")}</strong>
              </Typography>
              <Chip size="small" label={detail.jailed ? t("jailed") : (["bonded", "unbonding", "unbonded"].includes(statusLabel(detail.status)) ? t(statusLabel(detail.status) as "bonded" | "unbonding" | "unbonded") : detail.status)} color={detail.jailed ? "warning" : "success"} />
            </Stack>
            <Typography variant="body2">
              <strong>{t("description")}</strong> {detail.details || "-"}
            </Typography>
            <Typography variant="body2">
              <strong>{t("website")}</strong> {detail.website || "-"}
            </Typography>
            <Typography variant="body2">
              <strong>{t("identity")}</strong> {detail.identity || "-"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="subtitle1" fontWeight={700}>
               {t("staking_metrics")} </Typography>
            <Typography variant="body2">
              <strong>{t("voting_power")}</strong> {formatRawTokenAmount(detail.votingPower)}
            </Typography>
            <Typography variant="body2">
              <strong>{t("total_delegation")}</strong> {renderAmount("totalDelegationAmount", detail.totalDelegationAmount, detail)}
            </Typography>
            <Typography variant="body2">
              <strong>{t("self_delegation")}</strong> {renderAmount("selfDelegationAmount", detail.selfDelegationAmount, detail)}
            </Typography>
            <Typography variant="body2">
              <strong>{t("delegator_shares")}</strong> {detail.delegatorShares}
            </Typography>
            <Typography variant="body2">
              <strong>{t("commission_rate")}</strong> {formatCommissionPercent(detail.commission)}
            </Typography>
            <Typography variant="body2">
              <strong>{t("outstanding_rewards")}</strong> {renderAmount("outstandingRewardsAmount", detail.outstandingRewardsAmount, detail)}
            </Typography>
            <Typography variant="body2">
              <strong>{t("commission_rewards")}</strong> {renderAmount("commissionRewardsAmount", detail.commissionRewardsAmount, detail)}
            </Typography>
            <Typography variant="body2">
              <strong>{t("minimum_self_delegation")}</strong> {formatRawTokenAmount(detail.minSelfDelegation)}
            </Typography>
            <Typography variant="body2">
              <strong>{t("unbonding_height")}</strong> {detail.unbondingHeight}
            </Typography>
            <Typography variant="body2">
              <strong>{t("unbonding_time")}</strong> {detail.unbondingTime ? <LocalizedTime value={detail.unbondingTime} /> : "-"} {detail.unbondingTime ? `(${unbondingRelative})` : ""}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={700}>
               {t("my_position_and_actions")} </Typography>
            <Typography variant="body2" color="text.secondary">
               {t("current_wallet")} {effectiveAddress ?? t("disconnected")}
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
              <strong>{t("my_delegation")}</strong> {renderAmount("delegationAmount", position.delegationAmount, position)}
            </Typography>
            <Typography variant="body2">
              <strong>{t("my_unbonding")}</strong> {renderAmount("unbondingAmount", position.unbondingAmount, position)}
            </Typography>
            <Typography variant="body2">
              <strong>{t("my_reward")}</strong> {renderAmount("rewardAmount", position.rewardAmount, position)}
            </Typography>
            <Typography variant="body2">
              <strong>{t("operator_wallet")}</strong> {position.isOperator ? t("yes") : t("no")}
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
