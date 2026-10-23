"use client";
import { useTranslations } from "next-intl";

import { ModuleTable, moduleTextCellSx } from "@/components/query/module-table";

import Link from "@/components/layout/chain-link";
import { useQuery } from "@/hooks/use-query";
import { ModuleQueryStatus as QueryStatus } from "@/components/query/module-query-status";

import { useParams } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  Stack,
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
  const t = useTranslations("modules");
  const params = useParams<{ address: string }>();
  const address = params.address ?? "";
  const query = useQuery(`feepolicy:${address}`, client => getFeePolicyDiscountByAddress(address, client));
  const detail = query.result.data;
  if (!detail) return <QueryStatus {...query} label={t("discount_policy")} />;

  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <Typography variant="body2">{t("discount_types_and_amounts_are_raw_values_scope_units")}</Typography>
      <QueryStatus {...query} label={t("discount_policy")} />
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
           {t("feepolicy_discount_details")} </Typography>
        <Button component={Link} href="/feepolicy" variant="outlined" size="small">
           {t("list")} </Button>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary">
             {t("address")} </Typography>
          <Typography sx={{ mt: 0.5, fontFamily: "monospace", wordBreak: "break-all" }}>
            {toFeePolicyAddressLabel(detail.address)}
          </Typography>
        </CardContent>
      </Card>

      {detail.modules.length === 0 ? (
        <Typography variant="body2">{t("no_registered_discount_modules")}</Typography>
      ) : (
        detail.modules.map((moduleItem) => (
          <Card variant="outlined" key={moduleItem.module}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                {moduleItem.module}
              </Typography>
              {moduleItem.discounts.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                   {t("no_registered_discount_items")} </Typography>
              ) : (
                <ModuleTable>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("discount_type")}</TableCell>
                      <TableCell>{t("message_type")}</TableCell>
                      <TableCell align="right">{t("amount")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {moduleItem.discounts.map((item, index) => (
                      <TableRow key={`${moduleItem.module}-${item.msgType}-${index}`}>
                        <TableCell>{item.discountType}</TableCell>
                        <TableCell sx={{ ...moduleTextCellSx, fontFamily: "monospace" }}>{item.msgType}</TableCell>
                        <TableCell align="right">{item.amount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </ModuleTable>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}
