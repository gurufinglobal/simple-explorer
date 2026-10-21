"use client";

import { useQuery } from "@/hooks/use-query";
import { ModuleQueryStatus as QueryStatus } from "@/components/query/module-query-status";

import { useParams } from "next/navigation";
import {
  Alert,
  Card,
  CardContent,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { BexCoin } from "@/services/guru/bex.service";
import { getBexExchangeById, getBexExchangeFees } from "@/services/guru/bex.service";


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
            {hasError ? "조회 결과를 확인할 수 없습니다." : "데이터가 없습니다."}
          </Typography>
        ) : (
          <div role="region" aria-label="모듈 표 가로 스크롤" tabIndex={0} style={{ maxWidth: "100%", overflowX: "auto" }}><Table size="small">
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
          </Table></div>
        )}
      </CardContent>
    </Card>
  );
}

export function BexDetailView() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const query = useQuery(`bex:${id}`, client => getBexExchangeById(id, client));
  const exchange = query.result.data;
  const feeQuery = useQuery(`bex-fees:${id}`, client => getBexExchangeFees(id, client));
  const fees = feeQuery.result.data;
  if (!exchange) return <><QueryStatus {...query} /><QueryStatus {...feeQuery} /></>;

  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <Typography variant="body2">fee·limit는 원문입니다. 비율·금액 단위와 적용 의미는 미확인입니다. 수수료 잔액은 denom별 최소 단위 원문입니다.</Typography>
      <QueryStatus {...query} /><QueryStatus {...feeQuery} />
      <Typography variant="h5" fontWeight={700}>
        BEX Exchange #{exchange.id}
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
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
                <Typography>{exchange.fee}</Typography>
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
        hasError={fees?.hasCollectedError ?? true}
      />
      <FeesTable
        title="Locked Fees"
        coins={fees?.locked ?? []}
        hasError={fees?.hasLockedError ?? true}
      />
      <FeesTable
        title="Available Fees"
        coins={fees?.available ?? []}
        hasError={fees?.hasAvailableError ?? true}
      />
    </Stack>
  );
}
