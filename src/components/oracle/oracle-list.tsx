"use client";
import { withChain } from "@/lib/chain-selection";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { ModuleQueryStatus as QueryStatus } from "@/components/query/module-query-status";

import Link from "next/link";
import {
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
  listOracleRequests,
} from "@/services/guru/oracle.service";

const PAGE_SIZE = 20;

function formatEnumLabel(value: string): string {
  return value.replace(/^CATEGORY_/, "").replace(/^STATUS_/, "").toLowerCase().replaceAll("_", " ");
}

export function OracleList() {
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const query = useQuery(`oracle:${categoryFilter}:${statusFilter}`, client => listOracleRequests({ category: categoryFilter, status: statusFilter }, client));
  const paramsQuery = useQuery("oracle-params", client => getOracleParams(client));
  const moderator = useQuery("oracle-moderator", client => getOracleModeratorAddress(client));
  const categoriesQuery = useQuery("oracle-categories", client => getOracleCategories(client));
  const whitelist = useQuery("oracle-whitelist", client => getOracleWhitelist(client));
  const requests = useMemo(() => [...(query.result.data ?? [])].sort((a, b) => /^\d+$/.test(a.id) && /^\d+$/.test(b.id) ? (BigInt(b.id) > BigInt(a.id) ? 1 : BigInt(b.id) < BigInt(a.id) ? -1 : 0) : b.id.localeCompare(a.id)), [query.result.data]);
  const params = paramsQuery.result.data;
  const moderatorAddress = moderator.result.data;
  const categories = categoriesQuery.result.data ?? [];
  const whitelistCount = whitelist.result.data?.count ?? "-";
  const loading = query.busy && !query.result.data;
  const supported = query.result.data !== null;

  const pageCount = useMemo(() => Math.max(1, Math.ceil(requests.length / PAGE_SIZE)), [requests.length]);
  const pagedRequests = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return requests.slice(start, start + PAGE_SIZE);
  }, [page, requests]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, statusFilter]);

  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <Typography variant="h5" fontWeight={700}>
        Oracle Requests
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Oracle 필드는 원문입니다. period·quorum 단위와 nonce 최신 규칙은 미확인입니다.
      </Typography>

      <QueryStatus {...query} /><QueryStatus {...paramsQuery} /><QueryStatus {...moderator} /><QueryStatus {...categoriesQuery} /><QueryStatus {...whitelist} />

      {!loading && supported ? (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Enabled
                </Typography>
                <Typography variant="body1">{params ? params.enable === null ? "미확인" : String(params.enable) : "-"}</Typography>
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
            <div role="region" aria-label="모듈 표 가로 스크롤" tabIndex={0} style={{ maxWidth: "100%", overflowX: "auto" }}><Table size="small">
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
            </Table></div>
          </CardContent>
        </Card>
      ) : !supported ? null : requests.length === 0 ? (
        <Typography variant="body2">표시할 Oracle request가 없습니다.</Typography>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <div role="region" aria-label="모듈 표 가로 스크롤" tabIndex={0} style={{ maxWidth: "100%", overflowX: "auto" }}><Table size="small">
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
                  >
                    <TableCell><Link href={withChain(`/oracle/${encodeURIComponent(request.id)}`)}>{request.id}</Link></TableCell>
                    <TableCell>{request.symbol}</TableCell>
                    <TableCell>{formatEnumLabel(request.category)}</TableCell>
                    <TableCell>{formatEnumLabel(request.status)}</TableCell>
                    <TableCell align="right">{request.nonce}</TableCell>
                    <TableCell align="right">{request.period}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
            <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
              <Pagination page={page} count={pageCount} onChange={(_, nextPage) => setPage(nextPage)} size="small" />
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
