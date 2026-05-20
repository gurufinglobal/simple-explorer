"use client";

import { useEffect, useState } from "react";
import { Alert, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { getNetworkSummary } from "@/services/guru/network-summary.service";

type NetworkSummary = {
  chainId: string;
  blockHeight: number;
  averageBlockTimeSec: number;
  supply: string;
  inflation: string;
};

export function NetworkSummaryPanel() {
  const [summary, setSummary] = useState<NetworkSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const body = await getNetworkSummary();
        if (mounted) {
          setSummary(body);
          setError(null);
        }
      } catch {
        if (mounted) {
          setError("네트워크 지표를 불러오지 못했습니다.");
        }
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">체인 주요 지표</Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}
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
