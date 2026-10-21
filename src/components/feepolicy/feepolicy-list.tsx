"use client";
import { ModuleTable, moduleTextCellSx } from "@/components/query/module-table";
import { withChain } from "@/lib/chain-selection";

import { useMemo, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { ModuleQueryStatus as QueryStatus } from "@/components/query/module-query-status";

import Link from "next/link";
import {
  Card,
  CardContent,
  Pagination,
  Skeleton,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  getFeePolicyModeratorAddress,
  listFeePolicyDiscounts,
  toFeePolicyAddressLabel,
  type FeePolicyAccountDiscount,
} from "@/services/guru/feepolicy.service";

const PAGE_SIZE = 20;

function countDiscountItems(item: FeePolicyAccountDiscount): number {
  return item.modules.reduce((sum, moduleItem) => sum + moduleItem.discounts.length, 0);
}

export function FeePolicyList() {
  const query = useQuery("feepolicy-discounts", client => listFeePolicyDiscounts(client));
  const moderator = useQuery("feepolicy-moderator", client => getFeePolicyModeratorAddress(client));
  const items = useMemo(() => query.result.data ?? [], [query.result.data]);
  const moderatorAddress = moderator.result.data;
  const loading = query.busy && !query.result.data;
  const supported = query.result.data !== null;
  const [page, setPage] = useState(1);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(items.length / PAGE_SIZE)), [items.length]);
  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, page]);

  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <Typography variant="h5" fontWeight={700}>
        FeePolicy Discounts
      </Typography>
      <Typography variant="body2" color="text.secondary">
        할인 유형·amount는 원문입니다. percent와 percentage를 같은 단위로 환산하지 않습니다. 적용 범위·단위·우선순위는 미확인입니다.
      </Typography>

      <Typography variant="body2">할인 유형·amount는 원문입니다. 적용 범위·단위·우선순위는 미확인입니다. ALL은 빈 address 원문의 표시명이며 전체 계정 적용을 확정하지 않습니다.</Typography>
      <QueryStatus {...query} /><QueryStatus {...moderator} />

      {!loading && supported ? (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary">
              Moderator Address
            </Typography>
            <Typography sx={{ mt: 0.5, fontFamily: "monospace", wordBreak: "break-all" }}>
              {moderatorAddress ?? "-"}
            </Typography>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card variant="outlined">
          <CardContent>
            <Skeleton variant="text" width={150} />
            <Skeleton variant="text" width="92%" />
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Card variant="outlined">
          <CardContent>
            <ModuleTable>
              <TableHead>
                <TableRow>
                  <TableCell>Address</TableCell>
                  <TableCell align="right">Modules</TableCell>
                  <TableCell align="right">Discount Items</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`feepolicy-skeleton-${index}`}>
                    <TableCell><Skeleton variant="text" width="75%" /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={40} sx={{ ml: "auto" }} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={55} sx={{ ml: "auto" }} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ModuleTable>
          </CardContent>
        </Card>
      ) : !supported ? null : items.length === 0 ? (
        <Typography variant="body2">표시할 FeePolicy discount가 없습니다.</Typography>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <ModuleTable>
              <TableHead>
                <TableRow>
                  <TableCell>Address</TableCell>
                  <TableCell align="right">Modules</TableCell>
                  <TableCell align="right">Discount Items</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedItems.map((item) => (
                  <TableRow
                    key={item.address || "__all__"}
                  >
                    <TableCell sx={{ ...moduleTextCellSx, fontFamily: "monospace" }}>
                      <Link href={withChain(`/feepolicy/${encodeURIComponent(toFeePolicyAddressLabel(item.address))}`)}>{toFeePolicyAddressLabel(item.address)}</Link>
                    </TableCell>
                    <TableCell align="right">{item.modules.length}</TableCell>
                    <TableCell align="right">{countDiscountItems(item)}</TableCell>
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
