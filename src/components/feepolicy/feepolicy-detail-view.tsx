"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useParams } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  getFeePolicyDiscountByAddress,
  toFeePolicyAddressLabel,
} from "@/services/guru/feepolicy.service";

export function FeePolicyDetailView() {
  const params = useParams<{ address: string }>();
  const address = params.address ?? "";
  const query = useQuery(`feepolicy:${address}`, client => getFeePolicyDiscountByAddress(address, client));
  const detail = query.result.data;
  if (!detail) return <QueryStatus {...query} />;

  return (
    <Stack spacing={2}>
      <QueryStatus {...query} />
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          FeePolicy Discount 상세
        </Typography>
        <Button component={Link} href="/feepolicy" variant="outlined" size="small">
          목록
        </Button>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary">
            Address
          </Typography>
          <Typography sx={{ mt: 0.5, fontFamily: "monospace", wordBreak: "break-all" }}>
            {toFeePolicyAddressLabel(detail.address)}
          </Typography>
        </CardContent>
      </Card>

      {detail.modules.length === 0 ? (
        <Typography variant="body2">등록된 할인 모듈이 없습니다.</Typography>
      ) : (
        detail.modules.map((moduleItem) => (
          <Card variant="outlined" key={moduleItem.module}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                {moduleItem.module}
              </Typography>
              {moduleItem.discounts.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  등록된 할인 항목이 없습니다.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Discount Type</TableCell>
                      <TableCell>Message Type</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {moduleItem.discounts.map((item, index) => (
                      <TableRow key={`${moduleItem.module}-${item.msgType}-${index}`}>
                        <TableCell>{item.discountType}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>{item.msgType}</TableCell>
                        <TableCell align="right">{item.amount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}
