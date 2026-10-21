"use client";

import Link from "@/components/layout/chain-link";
import { useMemo, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  getOracleLatestResult,
  getOracleRequestById,
  listOracleReports,
  listOracleResults,
} from "@/services/guru/oracle.service";

const MAX_ORACLE_ROWS = 30;

function formatEnumLabel(value: string): string {
  return value.replace(/^CATEGORY_/, "").replace(/^STATUS_/, "").toLowerCase().replaceAll("_", " ");
}

function formatUnixSecondsWithTimezone(value: string): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const date = new Date(seconds * 1000);
  const local = date.toLocaleString(undefined, { timeZoneName: "short" });
  const utc = date.toISOString().replace("T", " ").replace("Z", " UTC");
  return `Local: ${local} | UTC: ${utc}`;
}

function sortByNonceDesc<T extends { nonce: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.nonce) - Number(a.nonce));
}

function takeLatestRows<T extends { nonce: string }>(rows: T[]): { rows: T[]; truncated: boolean } {
  const sorted = sortByNonceDesc(rows);
  return {
    rows: sorted.slice(0, MAX_ORACLE_ROWS),
    truncated: sorted.length > MAX_ORACLE_ROWS,
  };
}

function toFiniteNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumericShort(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function OracleDetailView() {
  const params = useParams<{ requestId: string }>();
  const requestId = params.requestId ?? "";
  const [reportNonce, setReportNonce] = useState("");
  const [reportProvider, setReportProvider] = useState("");
  const [reportFilter, setReportFilter] = useState({ nonce: "", provider: "" });
  const [tab, setTab] = useState(0);
  const query = useQuery(`oracle-request:${requestId}`, client => getOracleRequestById(requestId, client));
  const latestQuery = useQuery(`oracle-latest:${requestId}`, client => getOracleLatestResult(requestId, client));
  const reportQuery = useQuery(`oracle-reports:${requestId}:${reportFilter.nonce}:${reportFilter.provider}`, client => listOracleReports({ requestId, nonce: reportFilter.nonce || undefined, provider: reportFilter.provider || undefined }, client));
  const resultsQuery = useQuery(`oracle-results:${requestId}`, client => listOracleResults(requestId, client));
  const request = query.result.data;
  const latestResult = latestQuery.result.data;
  const reportRows = takeLatestRows(reportQuery.result.data ?? []);
  const resultRows = useMemo(() => takeLatestRows(resultsQuery.result.data ?? []), [resultsQuery.result.data]);
  const reports = reportRows.rows;
  const results = resultRows.rows;
  const reportsTruncated = reportRows.truncated;
  const resultsTruncated = resultRows.truncated;
  const reportsLoading = reportQuery.busy;
  const reloadReports = () => {
    const next = { nonce: reportNonce.trim(), provider: reportProvider.trim() };
    if (next.nonce === reportFilter.nonce && next.provider === reportFilter.provider) void reportQuery.refresh();
    else setReportFilter(next);
  };

  const resultsSorted = useMemo(() => sortByNonceDesc(results), [results]);
  const trendData = useMemo(() => {
    const rows = [...resultsSorted].reverse();
    const numericRows = rows
      .map((row) => ({
        nonce: row.nonce,
        value: toFiniteNumber(row.aggregatedData),
      }))
      .filter((row): row is { nonce: string; value: number } => row.value !== null);

    if (numericRows.length === 0) {
      return null;
    }

    const width = 960;
    const height = 260;
    const paddingX = 42;
    const paddingY = 24;
    const min = Math.min(...numericRows.map((row) => row.value));
    const max = Math.max(...numericRows.map((row) => row.value));
    const valueRange = max - min || 1;
    const xRange = width - paddingX * 2;
    const yRange = height - paddingY * 2;
    const step = numericRows.length > 1 ? xRange / (numericRows.length - 1) : 0;

    const points = numericRows.map((row, index) => {
      const x = paddingX + step * index;
      const normalizedY = (row.value - min) / valueRange;
      const y = paddingY + (1 - normalizedY) * yRange;
      return { x, y, nonce: row.nonce, value: row.value };
    });

    return {
      width,
      height,
      points,
      min,
      max,
      firstNonce: numericRows[0]?.nonce ?? "-",
      lastNonce: numericRows[numericRows.length - 1]?.nonce ?? "-",
    };
  }, [resultsSorted]);

  if (!request) return <QueryStatus {...query} />;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          Oracle Request #{request.id}
        </Typography>
        <Button component={Link} href="/oracle" variant="outlined" size="small">
          목록
        </Button>
      </Stack>
      <QueryStatus {...query} /><QueryStatus {...latestQuery} /><QueryStatus {...reportQuery} /><QueryStatus {...resultsQuery} />

      <Card variant="outlined">
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption" color="text.secondary">
                Symbol
              </Typography>
              <Typography>{request.symbol}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption" color="text.secondary">
                Category
              </Typography>
              <Typography>{formatEnumLabel(request.category)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Status
              </Typography>
              <Typography>{formatEnumLabel(request.status)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Nonce
              </Typography>
              <Typography>{request.nonce}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Period
              </Typography>
              <Typography>{request.period}</Typography>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">
                Latest Result
              </Typography>
              <Typography>
                {latestResult
                  ? `${latestResult.aggregatedData} (nonce ${latestResult.nonce}, height ${latestResult.aggregatedHeight}, ${formatUnixSecondsWithTimezone(latestResult.aggregatedTime)})`
                  : latestQuery.result.status === "not-found" ? "확인된 결과 없음" : "결과 미확인"}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Tabs value={tab} onChange={(_, value) => setTab(value)}>
            <Tab label="Overview" />
            <Tab label="Reports" />
            <Tab label="History" />
          </Tabs>
          <Box sx={{ mt: 2 }}>
            {tab === 0 ? (
              <Stack spacing={1.5}>
                <Typography variant="body2">Reports: {reportQuery.result.data ? reports.length : "-"}</Typography>
                <Typography variant="body2">Results History: {resultsQuery.result.data ? results.length : "-"}</Typography>
                {resultsTruncated ? (
                  <Alert severity="info">
                    Oracle Results API는 서버 페이징을 지원하지 않아 최근 {MAX_ORACLE_ROWS}건 기준으로 변화를 표시합니다.
                  </Alert>
                ) : null}
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" fontWeight={700}>
                      Aggregated Data Trend (Latest {MAX_ORACLE_ROWS})
                    </Typography>
                    {trendData === null || trendData.points.length < 2 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        라인 그래프를 그릴 수 있는 숫자형 aggregated data가 충분하지 않습니다.
                      </Typography>
                    ) : (
                      <Stack spacing={1} sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Nonce {trendData.firstNonce} → {trendData.lastNonce} | Min {formatNumericShort(trendData.min)} / Max{" "}
                          {formatNumericShort(trendData.max)}
                        </Typography>
                        <Box sx={{ width: "100%", overflowX: "auto" }}>
                          <svg
                            width="100%"
                            viewBox={`0 0 ${trendData.width} ${trendData.height}`}
                            role="img"
                            aria-label="Aggregated data trend line chart"
                          >
                            <line
                              x1={42}
                              y1={trendData.height - 24}
                              x2={trendData.width - 42}
                              y2={trendData.height - 24}
                              stroke="currentColor"
                              strokeOpacity="0.25"
                            />
                            <line x1={42} y1={24} x2={42} y2={trendData.height - 24} stroke="currentColor" strokeOpacity="0.25" />
                            <polyline
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              points={trendData.points.map((point) => `${point.x},${point.y}`).join(" ")}
                            />
                            {trendData.points.map((point, index) => (
                              <circle key={`trend-point-${index}`} cx={point.x} cy={point.y} r="2.4" fill="currentColor" />
                            ))}
                          </svg>
                        </Box>
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              </Stack>
            ) : null}

            {tab === 1 ? (
              <Stack spacing={1.5}>
                {reportsTruncated ? (
                  <Alert severity="info">
                    Oracle Reports API는 서버 페이징을 지원하지 않아 최근 {MAX_ORACLE_ROWS}건만 표시합니다.
                  </Alert>
                ) : null}
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <TextField
                    size="small"
                    label="Nonce"
                    value={reportNonce}
                    onChange={(event) => setReportNonce(event.target.value)}
                  />
                  <TextField
                    size="small"
                    label="Provider"
                    value={reportProvider}
                    onChange={(event) => setReportProvider(event.target.value)}
                    fullWidth
                  />
                  <Button variant="outlined" onClick={() => void reloadReports()} disabled={reportsLoading}>
                    Apply
                  </Button>
                </Stack>
                {reportsLoading ? (
                  <Table size="small">
                    <TableBody>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <TableRow key={`oracle-report-skeleton-${index}`}>
                          <TableCell><Skeleton variant="text" width={200} /></TableCell>
                          <TableCell align="right"><Skeleton variant="text" width={40} sx={{ ml: "auto" }} /></TableCell>
                          <TableCell align="right"><Skeleton variant="text" width={90} sx={{ ml: "auto" }} /></TableCell>
                          <TableCell><Skeleton variant="text" width={220} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : reports.length === 0 ? (
                  <Typography variant="body2">{reportQuery.result.status === "empty" ? "표시할 report가 없습니다." : "Report 조회 결과 미확인"}</Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Provider</TableCell>
                        <TableCell align="right">Nonce</TableCell>
                        <TableCell align="right">Raw Data</TableCell>
                        <TableCell>Signature</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {reports.map((report, index) => (
                        <TableRow key={`${report.provider}-${report.nonce}-${index}`}>
                          <TableCell sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>{report.provider}</TableCell>
                          <TableCell align="right">{report.nonce}</TableCell>
                          <TableCell align="right">{report.rawData}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                            {report.signature || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Stack>
            ) : null}

            {tab === 2 ? (
              <Stack spacing={1}>
                {resultsTruncated ? (
                  <Alert severity="info">
                    Oracle Results API는 서버 페이징을 지원하지 않아 최근 {MAX_ORACLE_ROWS}건만 표시합니다.
                  </Alert>
                ) : null}
                {resultsSorted.length === 0 ? (
                  <Typography variant="body2">{resultsQuery.result.status === "empty" ? "표시할 결과 이력이 없습니다." : "결과 이력 미확인"}</Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell align="right">Nonce</TableCell>
                        <TableCell align="right">Aggregated Data</TableCell>
                        <TableCell align="right">Height</TableCell>
                        <TableCell>Time (Local / UTC)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {resultsSorted.map((result) => (
                        <TableRow key={`${result.requestId}-${result.nonce}`}>
                          <TableCell align="right">{result.nonce}</TableCell>
                          <TableCell align="right">{result.aggregatedData}</TableCell>
                          <TableCell align="right">{result.aggregatedHeight}</TableCell>
                          <TableCell>{formatUnixSecondsWithTimezone(result.aggregatedTime)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Stack>
            ) : null}
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
