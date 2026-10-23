"use client";
import { useTranslations } from "next-intl";


import { usePagedQuery } from "@/hooks/use-paged-query";
import { PageControls } from "@/components/query/page-controls";
import { QueryStatus } from "@/components/query/query-status";

import {
  Stack,
  Typography,
} from "@mui/material";
import { ValidatorsTable } from "@/components/staking/validators-table";
import { getValidatorsPage } from "@/services/guru/staking.service";

export default function StakingPage() {
  const t = useTranslations("staking");
  const query = usePagedQuery("staking", (client, cursor) => getValidatorsPage(20, client, cursor), row => row.operatorAddress);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
         {t("staking")} </Typography>

      <QueryStatus {...query} />
      <PageControls {...query} />
      {query.result.data && <ValidatorsTable validators={query.result.data} />}
    </Stack>
  );
}
