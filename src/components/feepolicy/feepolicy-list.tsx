"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  Pagination,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  FEEPOLICY_ALL_ROUTE_PARAM,
  getFeePolicyModeratorAddress,
  isFeePolicyGlobalAddress,
  listFeePolicyDiscounts,
  toFeePolicyAddressLabel,
  type FeePolicyAccountDiscount,
} from "@/services/guru/feepolicy.service";

const PAGE_SIZE = 20;

function countDiscountItems(item: FeePolicyAccountDiscount): number {
  return item.modules.reduce((sum, moduleItem) => sum + moduleItem.discounts.length, 0);
}

export function FeePolicyList() {
  const router = useRouter();
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
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        FeePolicy Discounts
      </Typography>
      <Typography variant="body2" color="text.secondary">
        `/guru/feepolicy/v1/moderator_address`, `/guru/feepolicy/v1/discounts` 결과를 기반으로 표시합니다.
      </Typography>

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
            <Table size="small">
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
            </Table>
          </CardContent>
        </Card>
      ) : !supported ? null : items.length === 0 ? (
        <Typography variant="body2">표시할 FeePolicy discount가 없습니다.</Typography>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <Table size="small">
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
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => {
                      const routeAddress = isFeePolicyGlobalAddress(item.address) ? FEEPOLICY_ALL_ROUTE_PARAM : item.address;
                      router.push(`/feepolicy/${encodeURIComponent(routeAddress)}`);
                    }}
                  >
                    <TableCell sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                      {toFeePolicyAddressLabel(item.address)}
                    </TableCell>
                    <TableCell align="right">{item.modules.length}</TableCell>
                    <TableCell align="right">{countDiscountItems(item)}</TableCell>
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
