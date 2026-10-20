"use client";

import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { getNetworkSummary } from "@/services/guru/network-summary.service";

export function NetworkSummaryPanel() {
  const query = useQuery("network-summary", client => getNetworkSummary(client));
  const summary = query.result.data;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">체인 주요 지표</Typography>
          <QueryStatus {...query} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption">Chain ID</Typography>
              <Typography variant="body1">{summary?.chainId ?? "-"}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption">Block Height</Typography>
              <Typography variant="body1">{summary?.blockHeight ?? "-"}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption">Average Block Time</Typography>
              <Typography variant="body1">{summary?.averageBlockTimeSec ?? "-"}초</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption">Supply</Typography>
              <Typography variant="body1">{summary?.supply ?? "-"}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="caption">Inflation</Typography>
              <Typography variant="body1">{summary?.inflation ?? "-"}</Typography>
            </Grid>
          </Grid>
        </Stack>
      </CardContent>
    </Card>
  );
}
