"use client";

import { CoinAmount } from "@/components/amount/coin-amount";
import { UnbondingDetails } from "@/components/amount/unbonding-details";
import Link from "next/link";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { useMemo, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";
import { DashboardQueryInfo } from "./dashboard-query-info";
import { MetricRawDetails } from "./metric-raw-details";

import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  getAccountsTotal,
  getApplicationVersions,
  getNetworkSummary,
} from "@/services/guru/network-summary.service";
import { useEffectiveCosmosAddress } from "@/hooks/use-effective-cosmos-address";
import { getTopValidators } from "@/services/guru/staking.service";
import { SendForm } from "@/components/transactions/send-form";
import { SavedTransactions } from "@/components/transactions/transaction-result";
import { StakingForm } from "@/components/transactions/staking-form";
import { useWalletPortfolioStore } from "@/stores/wallet-portfolio.store";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

function formatIntegerDisplay(value: string | null): string {
  if (!value || !/^[0-9]+$/.test(value)) {
    return "-";
  }
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatCompactAmount(value: string | null | undefined): string { return value ?? "-"; }

export function DashboardView() {
  const summary = useQuery("dashboard-summary", client => getNetworkSummary(client));
  const validators = useQuery("dashboard-validators", client => getTopValidators(100, client));
  const versions = useQuery("application-versions", client => getApplicationVersions(client));
  const accounts = useQuery("accounts-total", client => getAccountsTotal(client));
  const validatorOptions = validators.result.data ?? [];
  const appVersions = versions.result.data ?? [];
  const state = summary.result.data;
  const wallet = useWalletSessionStore();
  const effectiveCosmos = useEffectiveCosmosAddress();
  const storedPortfolio = useWalletPortfolioStore();
  const portfolio = storedPortfolio.result.context.chain === getActiveChainConfig().key && storedPortfolio.result.context.target === `portfolio:${effectiveCosmos}`
    ? storedPortfolio : { ...storedPortfolio, details: undefined, balance: "—", staking: "—", reward: "—", unbonding: "—", error: null, loading: false };
  const loading = summary.busy && !state;
  const isMetamask = wallet.status === "connected" && wallet.walletType === "metamask";
  const [activeAction, setActiveAction] = useState<"send" | "delegate" | null>(null);
  const walletTitle = useMemo(
    () => (wallet.status === "connected" ? `Connected (${wallet.walletType ?? "wallet"})` : "Not Connected"),
    [wallet.status, wallet.walletType],
  );

  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h5" fontWeight={700}>
                {loading ? <Skeleton variant="text" width={220} /> : (state?.chainId ?? "Guru Chain")}
              </Typography>
              {loading ? (
                <Skeleton variant="rounded" width={84} height={28} />
              ) : (
                <Chip label={`#${state?.blockHeight ?? "-"}`} color="primary" />
              )}
            </Stack>

            <Typography variant="body2" color="text.secondary">
              [Guru Chain Explorer] is a lightweight explorer dashboard for tracking blocks, transactions, staking, and governance.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip size="small" label="Layer1" />
              <Chip size="small" label="Interoperability" />
              <Chip size="small" label="Ecosystem" />
              <Chip size="small" label="Cross-chain" />
              <Chip size="small" label="Staking" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <DashboardQueryInfo key={summary.result.context.chain} queries={[
        { ...summary, label: "네트워크 지표" },
        { ...validators, label: "검증인" },
        { ...versions, label: "앱 버전" },
        { ...accounts, label: "계정 수" },
      ]} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="caption">Height</Typography>
              <Typography variant="h6">
                {loading ? <Skeleton variant="text" width={60} /> : (state?.blockHeight ?? "-")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="caption">Validators</Typography>
              <Typography variant="h6">
                {validators.busy && !validators.result.data ? <Skeleton variant="text" width={60} /> : (validators.result.data?.length ?? "-")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="caption">Supply</Typography>
              <Typography variant="h6" title={state?.supply ?? "-"}>
                {loading ? <Skeleton variant="text" width={130} /> : formatCompactAmount(state?.supply)}
              </Typography>
              <MetricRawDetails key={summary.result.context.chain} label="공급량" raw={state?.supplyRaw} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="caption">Bonded</Typography>
              <Typography variant="h6" title={state?.bonded ?? "-"}>
                {loading ? <Skeleton variant="text" width={130} /> : formatCompactAmount(state?.bonded)}
              </Typography>
              <MetricRawDetails key={summary.result.context.chain} label="본딩량" raw={state?.bondedRaw} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="caption">Inflation</Typography>
              <Typography variant="h6">
                {loading ? <Skeleton variant="text" width={90} /> : (state?.inflation ?? "-")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="caption">Avg Block Time (10)</Typography>
              <Typography variant="h6">
                {loading ? <Skeleton variant="text" width={90} /> : (state ? `${state.averageBlockTimeSec?.toFixed(2) ?? "-"}s` : "-")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="caption">Accounts</Typography>
              <Typography variant="h6">
                {accounts.busy && accounts.result.data === null ? <Skeleton variant="text" width={90} /> : formatIntegerDisplay(accounts.result.data)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="subtitle1" fontWeight={700}>
              Active Proposals
            </Typography>
            <Button component={Link} href="/governance" size="small" variant="outlined">
              Governance
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            활성 제안은 아직 조회하지 않았습니다. Governance에서 확인하세요.
          </Typography>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700}>
            {walletTitle}
          </Typography>
          {isMetamask ? (
            <Alert severity="info" sx={{ mt: 1 }}>
              MetaMask는 Cosmos SEND/DELEGATE 서명을 지원하지 않습니다. Keplr 또는 WalletConnect를 사용하세요.
            </Alert>
          ) : null}
          {effectiveCosmos ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Cosmos (LCD): {effectiveCosmos}
            </Typography>
          ) : null}
          {wallet.status === "connected" && portfolio.result.context.chain === getActiveChainConfig().key && portfolio.result.context.target === `portfolio:${effectiveCosmos}` ? <QueryStatus result={portfolio.result} busy={portfolio.loading} refresh={() => { if (effectiveCosmos) void portfolio.refresh(effectiveCosmos); }} /> : null}
          {wallet.status === "connected" && portfolio.details && <details><summary>자산 원본·언본딩 상세</summary>
            {(["balance", "staking", "reward"] as const).map(kind => <div key={kind}>{kind}{portfolio.details?.[kind]?.map(coin => <CoinAmount key={coin.denom} coin={coin} metadata={portfolio.details?.metadata} />)}</div>)}
            {portfolio.details.unbonding && <UnbondingDetails snapshot={portfolio.details.unbonding} duration={portfolio.details.unbondingTime} metadata={portfolio.details.metadata} />}
          </details>}
          {portfolio.error ? (
            <Alert severity="warning" sx={{ mb: 1 }}>
              {portfolio.error}
            </Alert>
          ) : null}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption">Balance</Typography>
              <Typography variant="body1">
                {wallet.status !== "connected"
                  ? "—"
                  : portfolio.loading
                    ? <Skeleton variant="text" width={70} />
                    : portfolio.balance}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption">Staking</Typography>
              <Typography variant="body1">
                {wallet.status !== "connected" ? "—" : portfolio.loading ? <Skeleton variant="text" width={70} /> : portfolio.staking}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption">Reward</Typography>
              <Typography variant="body1">
                {wallet.status !== "connected" ? "—" : portfolio.loading ? <Skeleton variant="text" width={70} /> : portfolio.reward}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption">Unbonding</Typography>
              <Typography variant="body1">
                {wallet.status !== "connected" ? "—" : portfolio.loading ? <Skeleton variant="text" width={70} /> : portfolio.unbonding}
              </Typography>
            </Grid>
          </Grid>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mt: 2 }}>
            <Button variant="contained" color="success" fullWidth>
              SWAP
            </Button>
            <Button
              variant={activeAction === "send" ? "outlined" : "contained"}
              color="info"
              fullWidth
              onClick={() => setActiveAction((prev) => (prev === "send" ? null : "send"))}
              disabled={wallet.status !== "connected"}
            >
              SEND
            </Button>
            <Button
              variant={activeAction === "delegate" ? "outlined" : "contained"}
              fullWidth
              onClick={() => setActiveAction((prev) => (prev === "delegate" ? null : "delegate"))}
              disabled={wallet.status !== "connected"}
            >
              DELEGATE
            </Button>
          </Stack>
          {activeAction === "send" && <SendForm key={getActiveChainConfig().key} />}
          <SavedTransactions chainKey={getActiveChainConfig().key} />
          {activeAction === "delegate" && <StakingForm key={getActiveChainConfig().key} validators={validatorOptions} />}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Application Versions
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Version</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {versions.busy && !versions.result.data
                ? Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    <TableCell>
                      <Skeleton variant="text" width={120} />
                    </TableCell>
                    <TableCell>
                      <Skeleton variant="text" width={160} />
                    </TableCell>
                  </TableRow>
                ))
                : appVersions.map((item) => (
                  <TableRow key={item.name}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.version}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
