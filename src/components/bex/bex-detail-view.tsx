"use client";
import { useTranslations } from "next-intl";

import { ModuleTable, moduleTextCellSx } from "@/components/query/module-table";

import { useQuery } from "@/hooks/use-query";
import { QueryInfo } from "@/components/query/query-info";

import { useParams } from "next/navigation";
import {
  Alert,
  Card,
  CardContent,
  Divider,
  Grid,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { BexCoin } from "@/services/guru/bex.service";
import { getBexExchangeById, getBexExchangeFees } from "@/services/guru/bex.service";


function FeesTable({ title, coins, hasError }: { title: string; coins: BexCoin[]; hasError: boolean }) {
  const t = useTranslations("modules");
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
          {title}
        </Typography>
        {hasError ? <Alert severity="warning">{t("some_fee_data_could_not_be_loaded")}</Alert> : null}
        {coins.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: hasError ? 1 : 0 }}>
            {hasError ? t("could_not_verify_the_query_result") : t("no_data_available")}
          </Typography>
        ) : (
          <ModuleTable>
            <TableHead>
              <TableRow>
                <TableCell>{t("denom")}</TableCell>
                <TableCell align="right">{t("amount")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {coins.map((coin) => (
                <TableRow key={`${title}-${coin.denom}`}>
                  <TableCell sx={moduleTextCellSx}>{coin.denom}</TableCell>
                  <TableCell align="right">{coin.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ModuleTable>
        )}
      </CardContent>
    </Card>
  );
}

export function BexDetailView() {
  const t = useTranslations("modules");
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const query = useQuery(`bex:${id}`, client => getBexExchangeById(id, client));
  const exchange = query.result.data;
  const feeQuery = useQuery(`bex-fees:${id}`, client => getBexExchangeFees(id, client));
  const fees = feeQuery.result.data;
  if (!exchange) return <QueryInfo queries={[{ ...query, label: t("exchange_details") }, { ...feeQuery, label: t("fees") }]} />;

  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <Typography variant="body2">{t("fee_and_limit_are_raw_values_their_units_and")}</Typography>
      <QueryInfo queries={[{ ...query, label: t("exchange_details") }, { ...feeQuery, label: t("fees") }]} />
      <Typography variant="h5" fontWeight={700}>
         {t("bex_exchange")}{exchange.id}
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <Typography variant="subtitle1" fontWeight={700}>
               {t("basic_information")} </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                   {t("exchange_id")} </Typography>
                <Typography>{exchange.id}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                   {t("pair")} </Typography>
                <Typography>{exchange.denomA} / {exchange.denomB}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                   {t("status")} </Typography>
                <Typography>{exchange.status}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                   {t("fee")} </Typography>
                <Typography>{exchange.fee}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                   {t("limit")} </Typography>
                <Typography>{exchange.limit}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                   {t("oracle_request_id")} </Typography>
                <Typography>{exchange.oracleRequestId}</Typography>
              </Grid>
            </Grid>

            <Divider />

            <Typography variant="subtitle1" fontWeight={700}>
               {t("addresses_and_routing")} </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                   {t("admin_address")} </Typography>
                <Typography sx={{ wordBreak: "break-all" }}>{exchange.adminAddress}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                   {t("reserve_address")} </Typography>
                <Typography sx={{ wordBreak: "break-all" }}>{exchange.reserveAddress}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                   {t("ibc_a")} </Typography>
                <Typography sx={{ wordBreak: "break-all" }}>
                  {exchange.ibcDenomA} ({exchange.portA}/{exchange.channelA})
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" color="text.secondary">
                   {t("ibc_b")} </Typography>
                <Typography sx={{ wordBreak: "break-all" }}>
                  {exchange.ibcDenomB} ({exchange.portB}/{exchange.channelB})
                </Typography>
              </Grid>
            </Grid>

            <Divider />

            <Typography variant="subtitle1" fontWeight={700}>
               {t("metadata")} </Typography>
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
        title={t("collected_fees")}
        coins={fees?.collected ?? []}
        hasError={fees?.hasCollectedError ?? true}
      />
      <FeesTable
        title={t("locked_fees")}
        coins={fees?.locked ?? []}
        hasError={fees?.hasLockedError ?? true}
      />
      <FeesTable
        title={t("available_fees")}
        coins={fees?.available ?? []}
        hasError={fees?.hasAvailableError ?? true}
      />
    </Stack>
  );
}
