"use client";
import { ServiceErrorText } from "@/components/query/service-error-text";

import { useTranslations } from "next-intl";


import { useQuery } from "@/hooks/use-query";
import { QueryInfo } from "@/components/query/query-info";

import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { getChainParamsSections } from "@/services/cosmos/params.service";

export function ParamsView() {
  const t = useTranslations("modules");
  const titles: Record<string, string> = { "auth": t("parameterSections.auth"), "bank": t("parameterSections.bank"), "staking": t("parameterSections.staking"), "slashing": t("parameterSections.slashing"), "distribution": t("parameterSections.distribution"), "mint": t("parameterSections.mint"), "gov-voting": t("parameterSections.gov-voting"), "gov-tallying": t("parameterSections.gov-tallying"), "gov-deposit": t("parameterSections.gov-deposit"), "crisis": t("parameterSections.crisis"), "ibc-transfer": t("parameterSections.ibc-transfer"), "oracle": t("parameterSections.oracle"), "feepolicy": t("parameterSections.feepolicy"), "bex": t("parameterSections.bex"), "feemarket": t("parameterSections.feemarket") };
  const query = useQuery("params", client => getChainParamsSections(client));
  const rows = query.result.data ?? [];
  const loading = query.busy && !query.result.data;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
           {t("parameters")} </Typography>

      </Stack>

      <Typography variant="body2" color="text.secondary">
         {t("query_the_selected_chain_s_main_module_parameters_from")} </Typography>

      <QueryInfo label={t("parameter_query_information")} queries={[{ ...query, label: t("parameters") }]}
        notices={rows.filter(row => row.error).map(row => `${titles[row.key] ?? row.title}: ${row.error?.status ? `HTTP ${row.error.status}` : row.error?.kind}`)} />

      {loading ? (
        <Grid container spacing={2}>
          {Array.from({ length: 8 }).map((_, index) => (
            <Grid key={`params-skeleton-${index}`} size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Skeleton variant="text" width={220} />
                  <Skeleton variant="rounded" height={140} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={2}>
          {rows.map((row) => (
            <Grid key={row.key} size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
                      <Typography variant="subtitle1" fontWeight={700}>
                        {titles[row.key] ?? row.title}
                      </Typography>
                      <Chip
                        label={row.status === "ok" ? t("ok") : t("unavailable")}
                        color={row.status === "ok" ? "success" : "warning"}
                        size="small"
                      />
                    </Stack>
                    {row.sourcePath ? (
                      <Typography variant="caption" color="text.secondary">
                         {t("source")} {row.sourcePath}
                      </Typography>
                    ) : null}
                    {row.error ? (
                      <Alert severity="warning">{<ServiceErrorText error={row.error} />} ({row.error.kind})</Alert>
                    ) : (
                      <Box
                        component="pre"
                        sx={{
                          m: 0,
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: "action.hover",
                          maxHeight: 280,
                          overflow: "auto",
                          fontSize: 12,
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {JSON.stringify(row.data, null, 2)}
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
