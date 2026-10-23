"use client";
import { useTranslations } from "next-intl";


import { useState } from "react";
import type { NormalizedProposal } from "@/lib/gov-types";
import Link from "@/components/layout/chain-link";
import { usePagedQuery } from "@/hooks/use-paged-query";
import { PageControls } from "@/components/query/page-controls";
import { QueryStatus } from "@/components/query/query-status";

import { Button, Stack, Typography } from "@mui/material";
import { GovernanceProposalsList, type FilterKey, type SortKey } from "@/components/governance/governance-proposals-list";
import { listProposalsPage } from "@/services/guru/governance-query.service";

const EMPTY: NormalizedProposal[] = [];
export default function GovernancePage() {
  const t = useTranslations("governance");
  const [criteria, setCriteria] = useState<{ filter: FilterKey; sort: SortKey }>({ filter: "all", sort: "newest" });
  const query = usePagedQuery("governance", (client, cursor) => listProposalsPage(100, client, cursor), row => row.id, undefined, `${criteria.filter}:${criteria.sort}`);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>
           {t("governance")} </Typography>
        <Button component={Link} href="/governance/new" variant="contained" size="small">
           {t("new_proposal")} </Button>
      </Stack>

      <QueryStatus {...query} />
      <PageControls {...query} />
      <GovernanceProposalsList available={query.result.data !== null} initialProposals={query.result.data ?? EMPTY} filterValue={criteria.filter} sortValue={criteria.sort} onCriteriaChange={(filter, sort) => setCriteria({ filter, sort })} />
    </Stack>
  );
}
