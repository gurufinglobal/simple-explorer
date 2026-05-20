"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Pagination,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  getOracleCategories,
  getOracleModeratorAddress,
  getOracleParams,
  getOracleWhitelist,
  isOracleAvailable,
  listOracleRequests,
  type OracleParams,
  type OracleRequestRow,
} from "@/services/guru/oracle.service";

const PAGE_SIZE = 20;

function formatEnumLabel(value: string): string {
  return value.replace(/^CATEGORY_/, "").replace(/^STATUS_/, "").toLowerCase().replaceAll("_", " ");
}

function parseSortKey(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function OracleList() {
  const router = useRouter();
  const [requests, setRequests] = useState<OracleRequestRow[]>([]);
  const [params, setParams] = useState<OracleParams | null>(null);
  const [moderatorAddress, setModeratorAddress] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [whitelistCount, setWhitelistCount] = useState("0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoading(true);
      try {
        const available = await isOracleAvailable();
        if (!mounted) return;
        setSupported(available);
        if (!available) {
          setRequests([]);
          setParams(null);
          setModeratorAddress(null);
          setCategories([]);
          setWhitelistCount("0");
          setError(null);
          return;
        }

        const [nextRequests, nextParams, nextModerator, nextCategories, nextWhitelist] =
          await Promise.all([
            listOracleRequests({ category: categoryFilter, status: statusFilter }),
            getOracleParams(),
            getOracleModeratorAddress(),
            getOracleCategories(),
            getOracleWhitelist(),
          ]);
        if (!mounted) return;
        setRequests(
          [...nextRequests].sort((a, b) => parseSortKey(b.id) - parseSortKey(a.id)),
        );
        setParams(nextParams);
        setModeratorAddress(nextModerator);
        setCategories(nextCategories);
        setWhitelistCount(nextWhitelist.count);
        setError(null);
      } catch {
        if (!mounted) return;
        setRequests([]);
        setError("Oracle 데이터를 불러오지 못했습니다.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [categoryFilter, statusFilter]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(requests.length / PAGE_SIZE)), [requests.length]);
  const pagedRequests = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return requests.slice(start, start + PAGE_SIZE);
  }, [page, requests]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, statusFilter]);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        Oracle Requests
      </Typography>
      <Typography variant="body2" color="text.secondary">
        `/guru/oracle/v2/*` 엔드포인트를 기반으로 표시합니다.
      </Typography>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {!supported && !loading ? (
        <Alert severity="info">현재 선택한 체인은 Oracle 모듈을 지원하지 않거나 조회 API가 비활성화되어 있습니다.</Alert>
      ) : null}

      {!loading && supported ? (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Enabled
                </Typography>
                <Typography variant="body1">{params?.enable ? "true" : "false"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Quorum Ratio
                </Typography>
                <Typography variant="body1">{params?.quorumRatio ?? "-"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Retention Blocks
                </Typography>
                <Typography variant="body1">{params?.reportRetentionBlocks ?? "-"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Whitelist Count
                </Typography>
                <Typography variant="body1">{whitelistCount}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Moderator Address
                </Typography>
                <Typography sx={{ mt: 0.5, wordBreak: "break-all", fontFamily: "monospace" }}>
                  {moderatorAddress ?? "-"}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                  Categories: {categories.length > 0 ? categories.map(formatEnumLabel).join(", ") : "-"}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : loading ? (
        <Grid container spacing={2}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Grid key={`oracle-summary-skeleton-${index}`} size={{ xs: 12, md: 3 }}>
              <Card variant="outlined">
                <CardContent>
                  <Skeleton variant="text" width={120} />
                  <Skeleton variant="text" width={80} />
                </CardContent>
              </Card>
            </Grid>
          ))}
          <Grid size={{ xs: 12 }}>
            <Card variant="outlined">
              <CardContent>
                <Skeleton variant="text" width={140} />
                <Skeleton variant="text" width="95%" />
                <Skeleton variant="text" width="70%" />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : null}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField
          select
          size="small"
          label="Category"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          sx={{ minWidth: 220 }}
          disabled={loading || !supported}
        >
          <MenuItem value="ALL">All</MenuItem>
          {categories.map((category) => (
            <MenuItem key={category} value={category}>
              {formatEnumLabel(category)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          sx={{ minWidth: 220 }}
          disabled={loading || !supported}
        >
          <MenuItem value="ALL">All</MenuItem>
          <MenuItem value="STATUS_ACTIVE">active</MenuItem>
          <MenuItem value="STATUS_INACTIVE">inactive</MenuItem>
        </TextField>
      </Stack>

      {loading ? (
        <Card variant="outlined">
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Nonce</TableCell>
                  <TableCell align="right">Period</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`oracle-list-skeleton-${index}`}>
                    <TableCell><Skeleton variant="text" width={40} /></TableCell>
                    <TableCell><Skeleton variant="text" width={100} /></TableCell>
                    <TableCell><Skeleton variant="text" width={90} /></TableCell>
                    <TableCell><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={40} sx={{ ml: "auto" }} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={40} sx={{ ml: "auto" }} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : !supported ? null : requests.length === 0 ? (
        <Typography variant="body2">표시할 Oracle request가 없습니다.</Typography>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Nonce</TableCell>
                  <TableCell align="right">Period</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedRequests.map((request) => (
                  <TableRow
                    key={request.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => {
                      router.push(`/oracle/${encodeURIComponent(request.id)}`);
                    }}
                  >
                    <TableCell>{request.id}</TableCell>
                    <TableCell>{request.symbol}</TableCell>
                    <TableCell>{formatEnumLabel(request.category)}</TableCell>
                    <TableCell>{formatEnumLabel(request.status)}</TableCell>
                    <TableCell align="right">{request.nonce}</TableCell>
                    <TableCell align="right">{request.period}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
              <Pagination page={page} count={pageCount} onChange={(_, nextPage) => setPage(nextPage)} size="small" />
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
