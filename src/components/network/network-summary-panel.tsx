"use client";
import { useTranslations } from "next-intl";


import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { getNetworkSummary } from "@/services/guru/network-summary.service";

export function NetworkSummaryPanel() {
  const t = useTranslations("explorer");
  const query = useQuery("network-summary", client => getNetworkSummary(client));
  const summary = query.result.data;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">{t("key_chain_metrics")}</Typography>
          <QueryStatus {...query} />
          {summary && <details><summary>{t("raw_supply_and_bond_values")}</summary>{summary.supplyRaw ?? t("supply_unknown")}<br />{summary.bondedRaw ?? t("bond_unknown")}</details>}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption">{t("chain_id_2")}</Typography>
              <Typography variant="body1">{summary?.chainId ?? "-"}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption">{t("block_height")}</Typography>
              <Typography variant="body1">{summary?.blockHeight ?? "-"}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption">{t("average_block_time")}</Typography>
              <Typography variant="body1">{summary?.averageBlockTimeSec ?? "-"}{t("seconds")}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption">{t("supply")}</Typography>
              <Typography variant="body1">{summary?.supply ?? "-"}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption">{t("bonded")}</Typography>
              <Typography variant="body1">{summary?.bonded ?? "-"}</Typography>
              <Typography variant="caption">{t("inflation")}</Typography>
              <Typography variant="body1">{summary?.inflation ?? "-"}</Typography>
            </Grid>
          </Grid>
        </Stack>
      </CardContent>
    </Card>
  );
}
