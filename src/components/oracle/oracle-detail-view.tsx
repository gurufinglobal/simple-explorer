"use client";
import { useTranslations } from "next-intl";

import { ModuleTable, moduleTextCellSx } from "@/components/query/module-table";

import Link from "@/components/layout/chain-link";
import { useMemo, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { QueryInfo } from "@/components/query/query-info";

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
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  getOracleResultAtNonceZero,
  getOracleRequestById,
  listOracleReports,
  listOracleResults,
} from "@/services/guru/oracle.service";

const MAX_ORACLE_ROWS = 30;

function formatEnumLabel(value: string): string {
  return value.replace(/^CATEGORY_/, "").replace(/^STATUS_/, "").toLowerCase().replaceAll("_", " ");
}



function sortByNonceDesc<T extends { nonce: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (!/^\d+$/.test(a.nonce) || !/^\d+$/.test(b.nonce)) return b.nonce.localeCompare(a.nonce);
    return BigInt(a.nonce) > BigInt(b.nonce) ? -1 : BigInt(a.nonce) < BigInt(b.nonce) ? 1 : 0;
  });
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
  const t = useTranslations("modules");
function formatResultTime(value: string): string {
  return t("raw_time_unit_unverified", { value0: value });
}

  const params = useParams<{ requestId: string }>();
  const requestId = params.requestId ?? "";
  const [reportNonce, setReportNonce] = useState("");
  const [reportProvider, setReportProvider] = useState("");
  const [reportFilter, setReportFilter] = useState({ nonce: "", provider: "" });
  const [tab, setTab] = useState(0);
  const query = useQuery(`oracle-request:${requestId}`, client => getOracleRequestById(requestId, client));
  const latestQuery = useQuery(`oracle-nonce-zero:${requestId}`, client => getOracleResultAtNonceZero(requestId, client));
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

  if (!request) return <QueryInfo queries={[{ ...query, label: t("oracle_request") }, { ...latestQuery, label: t("recent_result") }, { ...reportQuery, label: t("reports") }, { ...resultsQuery, label: t("result_history") }]} />;

  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
           {t("oracle_request_2")}{request.id}
        </Typography>
        <Button component={Link} href="/oracle" variant="outlined" size="small">
           {t("list")} </Button>
      </Stack>
      <Typography variant="body2">{t("the_meaning_of_latest_for_nonce_0_and_the")}</Typography>
      <QueryInfo queries={[{ ...query, label: t("oracle_request") }, { ...latestQuery, label: t("recent_result") }, { ...reportQuery, label: t("reports") }, { ...resultsQuery, label: t("result_history") }]} />

      <Card variant="outlined">
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption" color="text.secondary">
                 {t("symbol")} </Typography>
              <Typography>{request.symbol}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Typography variant="caption" color="text.secondary">
                 {t("category")} </Typography>
              <Typography>{formatEnumLabel(request.category)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <Typography variant="caption" color="text.secondary">
                 {t("status")} </Typography>
              <Typography>{formatEnumLabel(request.status)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <Typography variant="caption" color="text.secondary">
                 {t("nonce")} </Typography>
              <Typography>{request.nonce}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <Typography variant="caption" color="text.secondary">
                 {t("period")} </Typography>
              <Typography>{request.period}</Typography>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">
                 {t("result_query_nonce_0_latest_semantics_unverified")} </Typography>
              <Typography>
                {latestResult
                  ? t("resultSummary", { data: latestResult.aggregatedData, nonce: latestResult.nonce, height: latestResult.aggregatedHeight, time: formatResultTime(latestResult.aggregatedTime) })
                  : latestQuery.result.status === "not-found" ? t("no_confirmed_result") : t("result_unknown")}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Tabs value={tab} onChange={(_, value) => setTab(value)}>
            <Tab label={t("overview")} />
            <Tab label={t("reports_2")} />
            <Tab label={t("history")} />
          </Tabs>
          <Box sx={{ mt: 2 }}>
            {tab === 0 ? (
              <Stack spacing={1.5}>
                <Typography variant="body2">{t("reports_3")} {reportQuery.result.data ? reports.length : "-"}</Typography>
                <Typography variant="body2">{t("results_history")} {resultsQuery.result.data ? results.length : "-"}</Typography>
                {resultsTruncated ? (
                  <Alert severity="info">
                     {t("the_oracle_results_api_does_not_support_server_pagination")} {MAX_ORACLE_ROWS}{t("records")} </Alert>
                ) : null}
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" fontWeight={700}>
                       {t("aggregated_data_trend_approximate_within")} {MAX_ORACLE_ROWS}{t("displayed_records")} </Typography>
                    {trendData === null || trendData.points.length < 2 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                         {t("not_enough_numeric_aggregated_data_to_draw_a_line")} </Typography>
                    ) : (
                      <Stack spacing={1} sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                           {t("nonce")} {trendData.firstNonce} → {trendData.lastNonce}  {t("message")} {formatNumericShort(trendData.min)}  {t("max")}{" "}
                          {formatNumericShort(trendData.max)}
                        </Typography>
                        <Box sx={{ width: "100%", overflowX: "auto" }}>
                          <svg
                            width="100%"
                            viewBox={`0 0 ${trendData.width} ${trendData.height}`}
                            role="img"
                            aria-label={t("aggregated_data_trend_line_chart")}
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
                     {t("displaying_only_the_latest")} {MAX_ORACLE_ROWS}{t("records_in_descending_nonce_order_full_history_availability_is")} </Alert>
                ) : null}
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <TextField
                    size="small"
                    label={t("nonce")}
                    value={reportNonce}
                    onChange={(event) => setReportNonce(event.target.value)}
                  />
                  <TextField
                    size="small"
                    label={t("provider")}
                    value={reportProvider}
                    onChange={(event) => setReportProvider(event.target.value)}
                    fullWidth
                  />
                  <Button variant="outlined" onClick={() => void reloadReports()} disabled={reportsLoading}>
                     {t("apply")} </Button>
                </Stack>
                {reportsLoading ? (
                  <ModuleTable>
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
                  </ModuleTable>
                ) : reports.length === 0 ? (
                  <Typography variant="body2">{reportQuery.result.status === "empty" ? t("no_reports_to_display") : t("report_query_result_unknown")}</Typography>
                ) : (
                  <ModuleTable>
                    <TableHead>
                      <TableRow>
                        <TableCell>{t("provider")}</TableCell>
                        <TableCell align="right">{t("nonce")}</TableCell>
                        <TableCell align="right">{t("raw_data")}</TableCell>
                        <TableCell>{t("signature")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {reports.map((report, index) => (
                        <TableRow key={`${report.provider}-${report.nonce}-${index}`}>
                          <TableCell sx={{ ...moduleTextCellSx, fontFamily: "monospace" }}>{report.provider}</TableCell>
                          <TableCell align="right">{report.nonce}</TableCell>
                          <TableCell align="right">{report.rawData}</TableCell>
                          <TableCell sx={{ ...moduleTextCellSx, fontFamily: "monospace" }}>
                            {report.signature || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </ModuleTable>
                )}
              </Stack>
            ) : null}

            {tab === 2 ? (
              <Stack spacing={1}>
                {resultsTruncated ? (
                  <Alert severity="info">
                     {t("displaying_only_the_latest")} {MAX_ORACLE_ROWS}{t("records_in_descending_nonce_order_full_history_availability_is")} </Alert>
                ) : null}
                {resultsSorted.length === 0 ? (
                  <Typography variant="body2">{resultsQuery.result.status === "empty" ? t("no_result_history_to_display") : t("result_history_unknown")}</Typography>
                ) : (
                  <ModuleTable>
                    <TableHead>
                      <TableRow>
                        <TableCell align="right">{t("nonce")}</TableCell>
                        <TableCell align="right">{t("aggregated_data")}</TableCell>
                        <TableCell align="right">{t("height")}</TableCell>
                        <TableCell>{t("time_raw")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {resultsSorted.map((result) => (
                        <TableRow key={`${result.requestId}-${result.nonce}`}>
                          <TableCell align="right">{result.nonce}</TableCell>
                          <TableCell align="right">{result.aggregatedData}</TableCell>
                          <TableCell align="right">{result.aggregatedHeight}</TableCell>
                          <TableCell>{formatResultTime(result.aggregatedTime)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </ModuleTable>
                )}
              </Stack>
            ) : null}
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
