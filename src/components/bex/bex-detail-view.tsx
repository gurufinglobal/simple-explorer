"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Card,
  CardContent,
  Divider,
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
import type { BexCoin, BexExchange, BexExchangeFees } from "@/services/guru/bex.service";
import { getBexExchangeById, getBexExchangeFees, isBexAvailable } from "@/services/guru/bex.service";

function formatFeePercent(rawFee: string): string {
  const trimmed = rawFee.trim();
  if (trimmed.endsWith("%")) {
    return trimmed;
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return rawFee;
  }
  const percent = numeric * 100;
  const formatted = percent.toFixed(4).replace(/\.?0+$/, "");
  return `${formatted}%`;
}

function FeesTable({ title, coins, hasError }: { title: string; coins: BexCoin[]; hasError: boolean }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
          {title}
        </Typography>
        {hasError ? <Alert severity="warning">일부 수수료 데이터를 불러오지 못했습니다.</Alert> : null}
        {coins.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: hasError ? 1 : 0 }}>
            데이터가 없습니다.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Denom</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {coins.map((coin) => (
                <TableRow key={`${title}-${coin.denom}`}>
                  <TableCell>{coin.denom}</TableCell>
                  <TableCell align="right">{coin.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function BexDetailView() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const [exchange, setExchange] = useState<BexExchange | null>(null);
  const [fees, setFees] = useState<BexExchangeFees | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const available = await isBexAvailable();
        if (!mounted) return;
        setSupported(available);
        if (!available) {
          setExchange(null);
          setFees(null);
          setError(null);
          return;
        }

        const exchangeResponse = await getBexExchangeById(id);
        if (!mounted) return;
        if (!exchangeResponse) {
          setExchange(null);
          setFees(null);
          setError(null);
          return;
        }
        setExchange(exchangeResponse);

        const feesResponse = await getBexExchangeFees(id);
        if (!mounted) return;
        setFees(feesResponse);
        setError(null);
      } catch {
        if (!mounted) return;
        setExchange(null);
        setFees(null);
        setError("BEX 상세 정보를 불러오지 못했습니다.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="text" width={240} height={40} />
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Skeleton variant="text" width={120} />
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={`bex-detail-skeleton-${index}`} variant="text" width={index % 2 === 0 ? "75%" : "60%"} />
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    );
  }

  if (!supported) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          BEX Exchange 상세
        </Typography>
        <Alert severity="info">현재 선택한 체인은 BEX 모듈을 지원하지 않거나 조회 API가 비활성화되어 있습니다.</Alert>
      </Stack>
    );
  }

  if (!exchange) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          BEX Exchange 상세
        </Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Typography variant="body2">요청한 exchange를 찾을 수 없습니다.</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        BEX Exchange #{exchange.id}
      </Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>
              기본 정보
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Exchange ID
                </Typography>
                <Typography>{exchange.id}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Pair
                </Typography>
                <Typography>{exchange.denomA} / {exchange.denomB}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Status
                </Typography>
                <Typography>{exchange.status}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Fee
                </Typography>
                <Typography>{formatFeePercent(exchange.fee)}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Limit
                </Typography>
                <Typography>{exchange.limit}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Oracle Request ID
                </Typography>
                <Typography>{exchange.oracleRequestId}</Typography>
              </Grid>
            </Grid>

            <Divider />

            <Typography variant="subtitle1" fontWeight={700}>
              주소 및 라우팅
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Admin Address
                </Typography>
                <Typography sx={{ wordBreak: "break-all" }}>{exchange.adminAddress}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Reserve Address
                </Typography>
                <Typography sx={{ wordBreak: "break-all" }}>{exchange.reserveAddress}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  IBC A
                </Typography>
                <Typography sx={{ wordBreak: "break-all" }}>
                  {exchange.ibcDenomA} ({exchange.portA}/{exchange.channelA})
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  IBC B
                </Typography>
                <Typography sx={{ wordBreak: "break-all" }}>
                  {exchange.ibcDenomB} ({exchange.portB}/{exchange.channelB})
                </Typography>
              </Grid>
            </Grid>

            <Divider />

            <Typography variant="subtitle1" fontWeight={700}>
              Metadata
            </Typography>
            <Typography
              component="pre"
              variant="body2"
              sx={{
                m: 0,
                p: 1.5,
                borderRadius: 1,
                bgcolor: "grey.100",
                color: "common.black",
                overflowX: "auto",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            >
              {exchange.metadata ? JSON.stringify(exchange.metadata, null, 2) : "-"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <FeesTable
        title="Collected Fees"
        coins={fees?.collected ?? []}
        hasError={fees?.hasCollectedError ?? false}
      />
      <FeesTable
        title="Locked Fees"
        coins={fees?.locked ?? []}
        hasError={fees?.hasLockedError ?? false}
      />
      <FeesTable
        title="Available Fees"
        coins={fees?.available ?? []}
        hasError={fees?.hasAvailableError ?? false}
      />
    </Stack>
  );
}
