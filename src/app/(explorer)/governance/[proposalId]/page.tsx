"use client";

import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useParams } from "next/navigation";
import { Stack } from "@mui/material";
import { GovernanceProposalDetail } from "@/components/governance/governance-proposal-detail";
import {
  getGovParams,
  getProposal,
  getProposalRaw,
  getProposalTally,
  listDeposits,
  listVotes,
} from "@/services/guru/governance-query.service";
export default function GovernanceProposalPage() {
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId ?? "";
  const proposal = useQuery(`proposal:${proposalId}`, client => getProposal(proposalId, client));
  const paramsQuery = useQuery(`gov-params:${proposalId}`, client => getGovParams(client));
  const tally = useQuery(`tally:${proposalId}`, client => getProposalTally(proposalId, client));
  const votes = useQuery(`votes:${proposalId}`, client => listVotes(proposalId, client));
  const deposits = useQuery(`deposits:${proposalId}`, client => listDeposits(proposalId, client));
  const raw = useQuery(`proposal-raw:${proposalId}`, client => getProposalRaw(proposalId, client));
  return <Stack spacing={2}>
    <QueryStatus {...proposal} /><QueryStatus {...paramsQuery} /><QueryStatus {...tally} />
    <QueryStatus {...votes} /><QueryStatus {...deposits} /><QueryStatus {...raw} />
    {proposal.result.data && <GovernanceProposalDetail key={proposalId}
      proposal={proposal.result.data}
      govParams={paramsQuery.result.data ?? { voting: null, tallying: null, deposit: null }}
      liveTally={tally.result.data}
      votesAvailable={votes.result.data !== null}
      depositsAvailable={deposits.result.data !== null}
      votes={votes.result.data ?? []}
      deposits={deposits.result.data ?? []}
      rawJson={raw.result.data ?? {}}
    />}
  </Stack>;
}
