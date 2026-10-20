"use client";

import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import {
  Stack,
  Typography,
} from "@mui/material";
import { ValidatorsTable } from "@/components/staking/validators-table";
import { getTopValidators } from "@/services/guru/staking.service";

export default function StakingPage() {
  const query = useQuery("staking", client => getTopValidators(20, client));

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        Staking
      </Typography>

      <QueryStatus {...query} />
      {query.result.data && <ValidatorsTable validators={query.result.data} />}
    </Stack>
  );
}
