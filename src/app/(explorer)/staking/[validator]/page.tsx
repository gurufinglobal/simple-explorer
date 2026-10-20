"use client";

import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useParams } from "next/navigation";
import { Stack } from "@mui/material";
import { ValidatorDetailView } from "@/components/staking/validator-detail-view";
import { getValidatorDetail } from "@/services/guru/staking.service";

export default function ValidatorDetailPage() {
  const params = useParams<{ validator: string }>();
  const validator = params.validator ?? "";
  const query = useQuery(`staking:${validator}`, client => getValidatorDetail(validator, client));
  return <Stack spacing={2}><QueryStatus {...query} />{query.result.data && <ValidatorDetailView key={validator} detail={query.result.data} />}</Stack>;
}
