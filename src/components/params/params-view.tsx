"use client";

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
  const query = useQuery("params", client => getChainParamsSections(client));
  const rows = query.result.data ?? [];
  const loading = query.busy && !query.result.data;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          Params
        </Typography>

      </Stack>

      <Typography variant="body2" color="text.secondary">
        현재 선택한 체인의 주요 모듈 파라미터를 LCD에서 조회합니다.
      </Typography>

      <QueryInfo label="Params 조회 정보" queries={[{ ...query, label: "Params" }]}
        notices={rows.filter(row => row.error).map(row => `${row.title}: ${row.error?.status ? `HTTP ${row.error.status}` : row.error?.kind}`)} />

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
                        {row.title}
                      </Typography>
                      <Chip
                        label={row.status === "ok" ? "OK" : "Unavailable"}
                        color={row.status === "ok" ? "success" : "warning"}
                        size="small"
                      />
                    </Stack>
                    {row.sourcePath ? (
                      <Typography variant="caption" color="text.secondary">
                        Source: {row.sourcePath}
                      </Typography>
                    ) : null}
                    {row.error ? (
                      <Alert severity="warning">{row.error.message} ({row.error.kind})</Alert>
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
