"use client";
import { useTranslations } from "next-intl";


import { useQuery } from "@/hooks/use-query";
import { ModuleQueryStatus as QueryStatus } from "@/components/query/module-query-status";

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
import { getDenomsMetadata } from "@/services/guru/token-metadata.service";

export function TokensMetadataList() {
  const t = useTranslations("modules");
  const query = useQuery("tokens", client => getDenomsMetadata(client));
  const items = query.result.data ?? [];
  const loading = query.busy && !query.result.data;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
         {t("tokens")} </Typography>
      <Typography variant="body2" color="text.secondary">
         {t("based_on_the_cosmos_bank_v1beta1_denoms_metadata_response")} </Typography>

      <QueryStatus {...query} label={t("token_metadata")} />

      {loading ? (
        <Card variant="outlined">
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("symbol")}</TableCell>
                  <TableCell>{t("name")}</TableCell>
                  <TableCell>{t("display")}</TableCell>
                  <TableCell>{t("base_denom")}</TableCell>
                  <TableCell align="right">{t("decimals")}</TableCell>
                  <TableCell>{t("description")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`token-skeleton-${index}`}>
                    <TableCell><Skeleton variant="text" width={70} /></TableCell>
                    <TableCell><Skeleton variant="text" width={90} /></TableCell>
                    <TableCell><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell><Skeleton variant="text" width={110} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={30} sx={{ ml: "auto" }} /></TableCell>
                    <TableCell><Skeleton variant="text" width="80%" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        query.result.status === "empty" ? <Typography variant="body2">{t("no_token_metadata_to_display")}</Typography> : null
      ) : (
        <Card variant="outlined">
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("symbol")}</TableCell>
                  <TableCell>{t("name")}</TableCell>
                  <TableCell>{t("display")}</TableCell>
                  <TableCell>{t("base_denom")}</TableCell>
                  <TableCell align="right">{t("decimals")}</TableCell>
                  <TableCell>{t("description")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.baseDenom}>
                    <TableCell>{item.symbol}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.displayDenom}</TableCell>
                    <TableCell>{item.baseDenom}</TableCell>
                    <TableCell align="right">{item.decimals ?? t("precision_unknown")}</TableCell>
                    <TableCell>{item.description}</TableCell>
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
