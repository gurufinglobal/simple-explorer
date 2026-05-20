"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
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
  type ApplicationVersionItem,
} from "@/services/guru/network-summary.service";
import { useEffectiveCosmosAddress } from "@/hooks/use-effective-cosmos-address";
import { getTopValidators, type ValidatorSummary } from "@/services/guru/staking.service";
import { submitSendTx } from "@/services/guru/bank-tx.client";
import { submitDelegateTx } from "@/services/guru/staking-tx.client";
import { useWalletPortfolioStore } from "@/stores/wallet-portfolio.store";
import { useWalletSessionStore } from "@/stores/wallet-session.store";

type DashboardState = {
  chainId: string;
  blockHeight: number;
  averageBlockTimeSec: number;
  supply: string;
  bonded: string;
  inflation: string;
  validators: number;
  accountsTotal: string;
};

function formatIntegerDisplay(value: string | null): string {
  if (!value || !/^[0-9]+$/.test(value)) {
    return "-";
  }
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatCompactAmount(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const trimmed = value.trim();
  const [numPart, ...unitParts] = trimmed.split(/\s+/);
  const unit = unitParts.join(" ");
  const numeric = Number(numPart.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return trimmed;
  }
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(numeric);
  return unit ? `${compact} ${unit}` : compact;
}

export function DashboardView() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [appVersions, setAppVersions] = useState<ApplicationVersionItem[]>([]);
  const [validatorOptions, setValidatorOptions] = useState<ValidatorSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wallet = useWalletSessionStore();
  const effectiveCosmos = useEffectiveCosmosAddress();
  const portfolio = useWalletPortfolioStore();
  const loading = state === null && !error;
  const canSignCosmos = wallet.status === "connected" && (wallet.walletType === "keplr" || wallet.walletType === "walletconnect");
  const isMetamask = wallet.status === "connected" && wallet.walletType === "metamask";
  const [activeAction, setActiveAction] = useState<"send" | "delegate" | null>(null);
  const [sendToAddress, setSendToAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendDenom, setSendDenom] = useState("agxn");
  const [delegateValidatorAddress, setDelegateValidatorAddress] = useState("");
  const [delegateAmount, setDelegateAmount] = useState("");
  const [delegateDenom, setDelegateDenom] = useState("agxn");
  const [actionBusy, setActionBusy] = useState<"send" | "delegate" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [summary, validators, versions, accountsTotal] = await Promise.all([
          getNetworkSummary(),
          getTopValidators(100),
          getApplicationVersions(),
          getAccountsTotal(),
        ]);
        if (!mounted) return;
        setState({
          chainId: summary.chainId,
          blockHeight: summary.blockHeight,
          averageBlockTimeSec: summary.averageBlockTimeSec,
          supply: summary.supply,
          bonded: summary.bonded,
          inflation: summary.inflation,
          validators: validators.length,
          accountsTotal: formatIntegerDisplay(accountsTotal),
        });
        setValidatorOptions(validators);
        setDelegateValidatorAddress((prev) => prev || validators[0]?.operatorAddress || "");
        setAppVersions(versions);
        setError(null);
      } catch {
        if (!mounted) return;
        setError("대시보드 데이터를 불러오지 못했습니다.");
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const walletTitle = useMemo(
    () => (wallet.status === "connected" ? `Connected (${wallet.walletType ?? "wallet"})` : "Not Connected"),
    [wallet.status, wallet.walletType],
  );

  const onSend = async () => {
    if (!canSignCosmos || !wallet.walletType) {
      setActionError("Keplr 또는 WalletConnect를 연결해야 SEND를 실행할 수 있습니다.");
      return;
    }
    if (!sendToAddress.trim()) {
      setActionError("수신 주소를 입력해주세요.");
      return;
    }
    if (!/^[0-9]+$/.test(sendAmount.trim()) || sendAmount.trim() === "0") {
      setActionError("전송 수량은 0보다 큰 정수 문자열이어야 합니다.");
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setActionBusy("send");
    try {
      const { txHash } = await submitSendTx({
        walletType: wallet.walletType,
        sessionTopic: wallet.sessionTopic,
        bech32Address: wallet.bech32Address,
        toAddress: sendToAddress.trim(),
        amount: sendAmount.trim(),
        denom: sendDenom.trim() || "agxn",
      });
      setActionSuccess(`SEND 트랜잭션이 전송되었습니다. Tx: ${txHash}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "SEND 트랜잭션 전송에 실패했습니다.");
    } finally {
      setActionBusy(null);
    }
  };

  const onDelegate = async () => {
    if (!canSignCosmos || !wallet.walletType) {
      setActionError("Keplr 또는 WalletConnect를 연결해야 DELEGATE를 실행할 수 있습니다.");
      return;
    }
    if (!delegateValidatorAddress.trim()) {
      setActionError("위임할 validator를 선택해주세요.");
      return;
    }
    if (!/^[0-9]+$/.test(delegateAmount.trim()) || delegateAmount.trim() === "0") {
      setActionError("위임 수량은 0보다 큰 정수 문자열이어야 합니다.");
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setActionBusy("delegate");
    try {
      const { txHash } = await submitDelegateTx({
        walletType: wallet.walletType,
        sessionTopic: wallet.sessionTopic,
        bech32Address: wallet.bech32Address,
        validatorAddress: delegateValidatorAddress.trim(),
        amount: delegateAmount.trim(),
        denom: delegateDenom.trim() || "agxn",
      });
      setActionSuccess(`DELEGATE 트랜잭션이 전송되었습니다. Tx: ${txHash}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "DELEGATE 트랜잭션 전송에 실패했습니다.");
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}

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

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 2 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption">Height</Typography>
              <Typography variant="h6">
                {loading ? <Skeleton variant="text" width={60} /> : (state?.blockHeight ?? "-")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption">Validators</Typography>
              <Typography variant="h6">
                {loading ? <Skeleton variant="text" width={60} /> : (state?.validators ?? "-")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption">Supply</Typography>
              <Typography variant="h6" title={state?.supply ?? "-"}>
                {loading ? <Skeleton variant="text" width={130} /> : formatCompactAmount(state?.supply)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption">Bonded</Typography>
              <Typography variant="h6" title={state?.bonded ?? "-"}>
                {loading ? <Skeleton variant="text" width={130} /> : formatCompactAmount(state?.bonded)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption">Inflation</Typography>
              <Typography variant="h6">
                {loading ? <Skeleton variant="text" width={90} /> : (state?.inflation ?? "-")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption">Avg Block Time (10)</Typography>
              <Typography variant="h6">
                {loading ? <Skeleton variant="text" width={90} /> : (state ? `${state.averageBlockTimeSec.toFixed(2)}s` : "-")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption">Accounts</Typography>
              <Typography variant="h6">
                {loading ? <Skeleton variant="text" width={90} /> : (state?.accountsTotal ?? "-")}
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
            {loading ? (
              <Skeleton variant="text" width="100%" />
            ) : (
              "No active proposals — open Governance for the full list."
            )}
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
          {actionError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {actionError}
            </Alert>
          ) : null}
          {actionSuccess ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              {actionSuccess}
            </Alert>
          ) : null}
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
          {activeAction === "send" ? (
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography variant="subtitle2">SEND</Typography>
              <TextField
                label="수신 주소"
                size="small"
                value={sendToAddress}
                onChange={(e) => setSendToAddress(e.target.value.trim())}
                disabled={!canSignCosmos || actionBusy !== null}
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  label="수량 (base denom)"
                  size="small"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value.trim())}
                  disabled={!canSignCosmos || actionBusy !== null}
                  fullWidth
                />
                <TextField
                  label="Denom"
                  size="small"
                  value={sendDenom}
                  onChange={(e) => setSendDenom(e.target.value.trim())}
                  disabled={!canSignCosmos || actionBusy !== null}
                  sx={{ minWidth: 140 }}
                />
              </Stack>
              <Button
                variant="contained"
                color="info"
                onClick={() => void onSend()}
                disabled={!canSignCosmos || actionBusy !== null}
              >
                Send Tx
              </Button>
            </Stack>
          ) : null}
          {activeAction === "delegate" ? (
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography variant="subtitle2">DELEGATE</Typography>
              <TextField
                select
                label="Validator"
                size="small"
                value={delegateValidatorAddress}
                onChange={(e) => setDelegateValidatorAddress(e.target.value)}
                disabled={!canSignCosmos || actionBusy !== null || validatorOptions.length === 0}
              >
                {validatorOptions.map((validator) => (
                  <MenuItem key={validator.operatorAddress} value={validator.operatorAddress}>
                    {validator.moniker || validator.operatorAddress}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  label="수량 (base denom)"
                  size="small"
                  value={delegateAmount}
                  onChange={(e) => setDelegateAmount(e.target.value.trim())}
                  disabled={!canSignCosmos || actionBusy !== null}
                  fullWidth
                />
                <TextField
                  label="Denom"
                  size="small"
                  value={delegateDenom}
                  onChange={(e) => setDelegateDenom(e.target.value.trim())}
                  disabled={!canSignCosmos || actionBusy !== null}
                  sx={{ minWidth: 140 }}
                />
              </Stack>
              <Button variant="contained" onClick={() => void onDelegate()} disabled={!canSignCosmos || actionBusy !== null}>
                Delegate Tx
              </Button>
            </Stack>
          ) : null}
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
              {loading
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
