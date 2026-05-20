"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
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
import {
  FEEPOLICY_ALL_ROUTE_PARAM,
  getFeePolicyDiscountByAddress,
  isFeePolicyAvailable,
  toFeePolicyAddressLabel,
  type FeePolicyAccountDiscount,
} from "@/services/guru/feepolicy.service";

export function FeePolicyDetailView() {
  const params = useParams<{ address: string }>();
  const address = params.address ?? "";
  const [detail, setDetail] = useState<FeePolicyAccountDiscount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const available = await isFeePolicyAvailable();
        if (!mounted) return;
        setSupported(available);
        if (!available) {
          setDetail(null);
          setError(null);
          return;
        }

        const response = await getFeePolicyDiscountByAddress(address);
        if (!mounted) return;
        setDetail(response);
        setError(null);
      } catch {
        if (!mounted) return;
        setDetail(null);
        setError("FeePolicy 상세 정보를 불러오지 못했습니다.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [address]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Skeleton variant="text" width={260} height={40} />
          <Skeleton variant="rounded" width={64} height={32} />
        </Stack>
        <Card variant="outlined">
          <CardContent>
            <Skeleton variant="text" width={100} />
            <Skeleton variant="text" width="85%" />
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Skeleton variant="text" width={120} />
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`feepolicy-detail-skeleton-${index}`} variant="text" width={index % 2 === 0 ? "90%" : "70%"} />
            ))}
          </CardContent>
        </Card>
      </Stack>
    );
  }

  if (!supported) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          FeePolicy Discount 상세
        </Typography>
        <Alert severity="info">현재 선택한 체인은 FeePolicy 모듈을 지원하지 않거나 조회 API가 비활성화되어 있습니다.</Alert>
      </Stack>
    );
  }

  if (!detail) {
    return (
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h5" fontWeight={700}>
            FeePolicy Discount 상세
          </Typography>
          <Button component={Link} href="/feepolicy" variant="outlined" size="small">
            목록
          </Button>
        </Stack>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Typography variant="body2">
          요청한 address({address === FEEPOLICY_ALL_ROUTE_PARAM ? "ALL" : address})의 할인 정보를 찾을 수 없습니다.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          FeePolicy Discount 상세
        </Typography>
        <Button component={Link} href="/feepolicy" variant="outlined" size="small">
          목록
        </Button>
      </Stack>
      {error ? <Alert severity="error">{error}</Alert> : null}

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
