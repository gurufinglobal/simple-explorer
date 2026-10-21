"use client";
import { withChain } from "@/lib/chain-selection";

import { useQuery } from "@/hooks/use-query";
import { ModuleQueryStatus as QueryStatus } from "@/components/query/module-query-status";

import Link from "next/link";
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

function parseNumericId(id: string): bigint | null {
  if (!/^[0-9]+$/.test(id)) {
    return null;
  }
  return BigInt(id);
}


function isActiveStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return normalized === "ACTIVE" || normalized.endsWith("_ACTIVE");
}

export function BexList() {
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
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <Typography variant="h5" fontWeight={700}>
        BEX Exchanges
      </Typography>
      <Typography variant="body2" color="text.secondary">
        fee·limit는 원문입니다. 비율·금액 단위와 적용 의미는 미확인입니다.
      </Typography>

      <QueryStatus {...query} />

      {loading ? (
        <Card variant="outlined">
          <CardContent>
            <div role="region" aria-label="모듈 표 가로 스크롤" tabIndex={0} style={{ maxWidth: "100%", overflowX: "auto" }}><Table size="small">
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
            </Table></div>
          </CardContent>
        </Card>
      ) : !supported ? null : items.length === 0 ? (
        <Typography variant="body2">표시할 BEX exchange가 없습니다.</Typography>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <div role="region" aria-label="모듈 표 가로 스크롤" tabIndex={0} style={{ maxWidth: "100%", overflowX: "auto" }}><Table size="small">
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
                  >
                    <TableCell><Link href={withChain(`/bex/${encodeURIComponent(item.id)}`)}>{item.id}</Link></TableCell>
                    <TableCell>{item.denomA} / {item.denomB}</TableCell>
                    <TableCell sx={isActiveStatus(item.status) ? { color: "primary.main", fontWeight: 600 } : undefined}>
                      {item.status}
                    </TableCell>
                    <TableCell>{item.fee}</TableCell>
                    <TableCell>{item.oracleRequestId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
