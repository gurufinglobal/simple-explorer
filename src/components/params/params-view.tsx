"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { getChainParamsSections, type ParamsSectionResult } from "@/services/cosmos/params.service";

export function ParamsView() {
  const [rows, setRows] = useState<ParamsSectionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getChainParamsSections();
      setRows(response);
      setError(null);
    } catch {
      setRows([]);
      setError("파라미터 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          Params
        </Typography>
        <Button variant="outlined" size="small" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        현재 선택한 체인의 주요 모듈 파라미터를 LCD에서 조회합니다.
      </Typography>

      {error ? <Alert severity="error">{error}</Alert> : null}

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
                      <Alert severity="warning">{row.error}</Alert>
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
