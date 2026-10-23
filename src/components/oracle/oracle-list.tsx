"use client";
import { useTranslations } from "next-intl";

import { ModuleTable } from "@/components/query/module-table";
import { withChain } from "@/lib/chain-selection";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { QueryInfo } from "@/components/query/query-info";

import Link from "next/link";
import {
  Card,
  CardContent,
  Grid,
  MenuItem,
  Pagination,
  Skeleton,
  Stack,
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
  const t = useTranslations("modules");
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
         {t("oracle_requests")} </Typography>
      <Typography variant="body2" color="text.secondary">
         {t("oracle_fields_are_raw_values_period_and_quorum_units")} </Typography>

      <QueryInfo queries={[{ ...query, label: t("requests") }, { ...paramsQuery, label: t("oracle_parameters") }, { ...moderator, label: t("administrator") }, { ...categoriesQuery, label: t("categories") }, { ...whitelist, label: t("allowlist") }]} />

      {!loading && supported ? (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                   {t("enabled")} </Typography>
                <Typography variant="body1">{params ? params.enable === null ? t("unknown") : String(params.enable) : "-"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                   {t("quorum_ratio")} </Typography>
                <Typography variant="body1">{params?.quorumRatio ?? "-"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                   {t("retention_blocks")} </Typography>
                <Typography variant="body1">{params?.reportRetentionBlocks ?? "-"}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                   {t("allowlist_count")} </Typography>
                <Typography variant="body1">{whitelistCount}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                   {t("moderator_address")} </Typography>
                <Typography sx={{ mt: 0.5, wordBreak: "break-all", fontFamily: "monospace" }}>
                  {moderatorAddress ?? "-"}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                   {t("categories_2")} {categories.length > 0 ? categories.map(formatEnumLabel).join(", ") : "-"}
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
          label={t("category")}
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          sx={{ minWidth: 220 }}
          disabled={loading || !supported}
        >
          <MenuItem value="ALL">{t("all")}</MenuItem>
          {categories.map((category) => (
            <MenuItem key={category} value={category}>
              {formatEnumLabel(category)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={t("status")}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          sx={{ minWidth: 220 }}
          disabled={loading || !supported}
        >
          <MenuItem value="ALL">{t("all")}</MenuItem>
          <MenuItem value="STATUS_ACTIVE">{t("active")}</MenuItem>
          <MenuItem value="STATUS_INACTIVE">{t("inactive")}</MenuItem>
        </TextField>
      </Stack>

      {loading ? (
        <Card variant="outlined">
          <CardContent>
            <ModuleTable>
              <TableHead>
                <TableRow>
                  <TableCell>{t("id")}</TableCell>
                  <TableCell>{t("symbol")}</TableCell>
                  <TableCell>{t("category")}</TableCell>
                  <TableCell>{t("status")}</TableCell>
                  <TableCell align="right">{t("nonce")}</TableCell>
                  <TableCell align="right">{t("period")}</TableCell>
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
            </ModuleTable>
          </CardContent>
        </Card>
      ) : !supported ? null : requests.length === 0 ? (
        <Typography variant="body2">{t("no_oracle_requests_to_display")}</Typography>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <ModuleTable>
              <TableHead>
                <TableRow>
                  <TableCell>{t("id")}</TableCell>
                  <TableCell>{t("symbol")}</TableCell>
                  <TableCell>{t("category")}</TableCell>
                  <TableCell>{t("status")}</TableCell>
                  <TableCell align="right">{t("nonce")}</TableCell>
                  <TableCell align="right">{t("period")}</TableCell>
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
            </ModuleTable>
            <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
              <Pagination page={page} count={pageCount} onChange={(_, nextPage) => setPage(nextPage)} size="small" />
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
