"use client";
import { Stack } from '@mui/material';
import { useQuery } from '@/hooks/use-query';
import { QueryStatus } from '@/components/query/query-status';
import { GovernanceNewProposalForm } from '@/components/governance/governance-new-proposal-form';
import { getGovParams } from '@/services/guru/governance-query.service';
export default function GovernanceNewProposalPage() {
  const query = useQuery('new-proposal-params', client => getGovParams(client));
  const denom = query.result.data?.deposit?.minDeposit[0]?.denom;
  return <Stack spacing={2}><QueryStatus {...query} />{denom && <GovernanceNewProposalForm key={denom} defaultDenom={denom} />}</Stack>;
}
