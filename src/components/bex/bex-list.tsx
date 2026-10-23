"use client";
import { useTranslations } from "next-intl";

import { ModuleTable, moduleTextCellSx } from "@/components/query/module-table";
import { withChain } from "@/lib/chain-selection";

import { useQuery } from "@/hooks/use-query";
import { ModuleQueryStatus as QueryStatus } from "@/components/query/module-query-status";

import Link from "next/link";
import {
  Card,
  CardContent,
  Skeleton,
  Stack,
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
  const t = useTranslations("modules");
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
         {t("bex_exchanges")} </Typography>
      <Typography variant="body2" color="text.secondary">
         {t("fee_and_limit_are_raw_values_their_units_and_2")} </Typography>

      <QueryStatus {...query} label={t("exchanges")} />

      {loading ? (
        <Card variant="outlined">
          <CardContent>
            <ModuleTable>
              <TableHead>
                <TableRow>
                  <TableCell>{t("id")}</TableCell>
                  <TableCell>{t("pair")}</TableCell>
                  <TableCell>{t("status")}</TableCell>
                  <TableCell>{t("fee")}</TableCell>
                  <TableCell>{t("oracle_reference_id")}</TableCell>
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
            </ModuleTable>
          </CardContent>
        </Card>
      ) : !supported ? null : items.length === 0 ? (
        <Typography variant="body2">{t("no_bex_exchanges_to_display")}</Typography>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <ModuleTable>
              <TableHead>
                <TableRow>
                  <TableCell>{t("id")}</TableCell>
                  <TableCell>{t("pair")}</TableCell>
                  <TableCell>{t("status")}</TableCell>
                  <TableCell>{t("fee")}</TableCell>
                  <TableCell>{t("oracle_reference_id")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                  >
                    <TableCell><Link href={withChain(`/bex/${encodeURIComponent(item.id)}`)}>{item.id}</Link></TableCell>
                    <TableCell sx={moduleTextCellSx}>{item.denomA} / {item.denomB}</TableCell>
                    <TableCell sx={isActiveStatus(item.status) ? { color: "primary.main", fontWeight: 600 } : undefined}>
                      {item.status}
                    </TableCell>
                    <TableCell>{item.fee}</TableCell>
                    <TableCell>{item.oracleRequestId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ModuleTable>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
