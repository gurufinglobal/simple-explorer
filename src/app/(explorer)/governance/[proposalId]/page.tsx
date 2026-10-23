"use client";
import { useTranslations } from "next-intl";


import { PageControls } from "@/components/query/page-controls";
import { usePagedQuery } from "@/hooks/use-paged-query";
import { useQuery } from "@/hooks/use-query";
import { QueryInfo } from "@/components/query/query-info";

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
  const t = useTranslations("governance");
  const key = useSearchParams()?.get("chain");
  const chain = key ? getChainByKey(key) : undefined;
  if (key && !chain) return <Alert severity="error">{t("missing_chain_configuration_for_the_proposal_link")} {key}</Alert>;
  return <GovernanceContent pinnedChain={chain ?? undefined} />;
}
function GovernanceContent({ pinnedChain }: { pinnedChain?: ChainConfig }) {
  const t = useTranslations("governance");
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId ?? "";
  const proposal = useQuery(`proposal:${proposalId}`, client => getProposal(proposalId, client), undefined, true, pinnedChain);
  const paramsQuery = useQuery(`gov-params:${proposalId}`, client => getGovParams(client), undefined, true, pinnedChain);
  const tally = useQuery(`tally:${proposalId}`, client => getProposalTally(proposalId, client), undefined, true, pinnedChain);
  const votes = usePagedQuery(`votes:${proposalId}`, (client, cursor) => listVotesPage(proposalId, client, cursor), row => row.voter, pinnedChain);
  const deposits = useQuery(`deposits:${proposalId}`, client => listDeposits(proposalId, client), undefined, true, pinnedChain);
  const raw = useQuery(`proposal-raw:${proposalId}`, client => getProposalRaw(proposalId, client), undefined, true, pinnedChain);
  return <Stack spacing={2}>
    {pinnedChain && <Alert severity="info">{t("proposal_link_chain")} {pinnedChain.key} / {pinnedChain.chainId}</Alert>}
    <QueryInfo queries={[{ ...proposal, label: t("proposal") }, { ...paramsQuery, label: t("governance_parameters") }, { ...tally, label: t("tally") }, { ...votes, label: t("votes") }, { ...deposits, label: t("deposits") }, { ...raw, label: t("original_proposal") }]} />
    {proposal.result.data && <GovernanceProposalDetail key={`${pinnedChain?.key ?? proposal.result.context.chain}:${proposalId}`} pinnedChain={pinnedChain}
      proposal={proposal.result.data}
      govParams={paramsQuery.result.data ?? { voting: null, tallying: null, deposit: null }}
      liveTally={tally.result.data}
      votesAvailable={votes.result.data !== null}
      depositsAvailable={deposits.result.data !== null}
      votesControls={<PageControls {...votes} label={t("votes")} />}
      votes={votes.result.data ?? []}
      deposits={deposits.result.data ?? []}
      rawJson={raw.result.data ?? {}}
    />}
  </Stack>;
}
