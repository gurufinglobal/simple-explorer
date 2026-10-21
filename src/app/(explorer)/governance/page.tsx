"use client";

import Link from "@/components/layout/chain-link";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { Button, Stack, Typography } from "@mui/material";
import { GovernanceProposalsList } from "@/components/governance/governance-proposals-list";
import { listProposals } from "@/services/guru/governance-query.service";

export default function GovernancePage() {
  const query = useQuery("governance", client => listProposals(100, client));

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>
          Governance
        </Typography>
        <Button component={Link} href="/governance/new" variant="contained" size="small">
          새 제안
        </Button>
      </Stack>

      <QueryStatus {...query} />
      {query.result.data && <GovernanceProposalsList initialProposals={query.result.data} />}
    </Stack>
  );
}
