"use client";

import { PageControls } from "@/components/query/page-controls";
import { usePagedQuery } from "@/hooks/use-paged-query";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useParams, useSearchParams } from "next/navigation";
import { Alert, Stack } from "@mui/material";
import { GovernanceProposalDetail } from "@/components/governance/governance-proposal-detail";
import {
  getGovParams,
  getProposal,
  getProposalRaw,
  getProposalTally,
  listDeposits,
  listVotesPage,
} from "@/services/guru/governance-query.service";
import { Suspense } from "react";
import { getChainByKey, type ChainConfig } from "@/lib/env";
export default function GovernanceProposalPage() {
  return <Suspense fallback={null}><GovernanceRoute /></Suspense>;
}
function GovernanceRoute() {
  const key = useSearchParams()?.get("chain");
  const chain = key ? getChainByKey(key) : undefined;
  if (key && !chain) return <Alert severity="error">제안 링크의 체인 설정이 없습니다: {key}</Alert>;
  return <GovernanceContent pinnedChain={chain ?? undefined} />;
}
function GovernanceContent({ pinnedChain }: { pinnedChain?: ChainConfig }) {
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId ?? "";
  const proposal = useQuery(`proposal:${proposalId}`, client => getProposal(proposalId, client), undefined, true, pinnedChain);
  const paramsQuery = useQuery(`gov-params:${proposalId}`, client => getGovParams(client), undefined, true, pinnedChain);
  const tally = useQuery(`tally:${proposalId}`, client => getProposalTally(proposalId, client), undefined, true, pinnedChain);
  const votes = usePagedQuery(`votes:${proposalId}`, (client, cursor) => listVotesPage(proposalId, client, cursor), row => row.voter, pinnedChain);
  const deposits = useQuery(`deposits:${proposalId}`, client => listDeposits(proposalId, client), undefined, true, pinnedChain);
  const raw = useQuery(`proposal-raw:${proposalId}`, client => getProposalRaw(proposalId, client), undefined, true, pinnedChain);
  return <Stack spacing={2}>
    {pinnedChain && <Alert severity="info">제안 링크 체인: {pinnedChain.key} / {pinnedChain.chainId}</Alert>}
    <QueryStatus {...proposal} /><QueryStatus {...paramsQuery} /><QueryStatus {...tally} />
    <QueryStatus {...votes} /><PageControls {...votes} label="투표" /><QueryStatus {...deposits} /><QueryStatus {...raw} />
    {proposal.result.data && <GovernanceProposalDetail key={`${pinnedChain?.key ?? proposal.result.context.chain}:${proposalId}`} pinnedChain={pinnedChain}
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
