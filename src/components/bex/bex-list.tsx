"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
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
import type { BexExchange } from "@/services/guru/bex.service";
import { isBexAvailable, listBexExchanges } from "@/services/guru/bex.service";

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
  const [items, setItems] = useState<BexExchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const available = await isBexAvailable();
        if (!mounted) return;
        setSupported(available);
        if (!available) {
          setItems([]);
          setError(null);
          return;
        }
        const response = await listBexExchanges();
        if (!mounted) return;
        const sorted = [...response].sort((a, b) => {
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
        setItems(sorted);
        setError(null);
      } catch {
        if (!mounted) return;
        setItems([]);
        setError("BEX 목록을 불러오지 못했습니다.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        BEX Exchanges
      </Typography>
      <Typography variant="body2" color="text.secondary">
        `/guru/bex/v1/exchanges` 결과를 기반으로 표시합니다.
      </Typography>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {!supported && !loading ? (
        <Alert severity="info">현재 선택한 체인은 BEX 모듈을 지원하지 않거나 조회 API가 비활성화되어 있습니다.</Alert>
      ) : null}

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
