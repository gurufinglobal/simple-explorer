"use client";

import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { listBexExchanges } from "@/services/guru/bex.service";

function parseNumericId(id: string): number | null {
  if (!/^[0-9]+$/.test(id)) {
    return null;
  }
  return Number.parseInt(id, 10);
}

function formatFeePercent(rawFee: string): string {
  const trimmed = rawFee.trim();
  if (trimmed.endsWith("%")) {
    return trimmed;
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return rawFee;
  }
  const percent = numeric * 100;
  const formatted = percent.toFixed(4).replace(/\.?0+$/, "");
  return `${formatted}%`;
}

function isActiveStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return normalized === "ACTIVE" || normalized.endsWith("_ACTIVE");
}

export function BexList() {
  const router = useRouter();
  const query = useQuery("bex-exchanges", client => listBexExchanges(client));
  const loading = query.busy && !query.result.data;
  const supported = query.result.data !== null;
  const items = [...(query.result.data ?? [])].sort((a, b) => {
    const activeDelta = Number(isActiveStatus(b.status)) - Number(isActiveStatus(a.status));
    if (activeDelta !== 0) {
      return activeDelta;
    }
    const left = parseNumericId(a.id);
    const right = parseNumericId(b.id);
    if (left === null && right === null) {
      return a.id.localeCompare(b.id);
    }
    if (left === null) {
      return 1;
    }
    if (right === null) {
      return -1;
    }
    return left - right;
  });
  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        BEX Exchanges
      </Typography>
      <Typography variant="body2" color="text.secondary">
        `/guru/bex/v1/exchanges` 결과를 기반으로 표시합니다.
      </Typography>

      <QueryStatus {...query} />

      {loading ? (
        <Card variant="outlined">
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Pair</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Fee</TableCell>
                  <TableCell>Oracle Ref. ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`bex-skeleton-${index}`}>
                    <TableCell><Skeleton variant="text" width={28} /></TableCell>
                    <TableCell><Skeleton variant="text" width={120} /></TableCell>
                    <TableCell><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell><Skeleton variant="text" width={70} /></TableCell>
                    <TableCell><Skeleton variant="text" width={50} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : !supported ? null : items.length === 0 ? (
        <Typography variant="body2">표시할 BEX exchange가 없습니다.</Typography>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Pair</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Fee</TableCell>
                  <TableCell>Oracle Ref. ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => {
                      router.push(`/bex/${encodeURIComponent(item.id)}`);
                    }}
                  >
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.denomA} / {item.denomB}</TableCell>
                    <TableCell sx={isActiveStatus(item.status) ? { color: "primary.main", fontWeight: 600 } : undefined}>
                      {item.status}
                    </TableCell>
                    <TableCell>{formatFeePercent(item.fee)}</TableCell>
                    <TableCell>{item.oracleRequestId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
