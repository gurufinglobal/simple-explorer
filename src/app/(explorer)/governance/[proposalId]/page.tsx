"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Stack, Typography } from "@mui/material";
import { GovernanceProposalDetail } from "@/components/governance/governance-proposal-detail";
import {
  getGovParams,
  getProposal,
  getProposalRaw,
  getProposalTally,
  listDeposits,
  listVotes,
} from "@/services/guru/governance-query.service";
import type { GovParamsBundle, GovTally, NormalizedProposal } from "@/lib/gov-types";
import type { GovernanceDepositRow, GovernanceVoteRow } from "@/services/guru/governance-query.service";

export default function GovernanceProposalPage() {
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId ?? "";
  const [proposal, setProposal] = useState<NormalizedProposal | null>(null);
  const [govParamsBundle, setGovParamsBundle] = useState<GovParamsBundle>({
    voting: null,
    tallying: null,
    deposit: null,
  });
  const [liveTally, setLiveTally] = useState<GovTally | null>(null);
  const [votes, setVotes] = useState<GovernanceVoteRow[]>([]);
  const [deposits, setDeposits] = useState<GovernanceDepositRow[]>([]);
  const [rawJson, setRawJson] = useState<unknown>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [proposalData, govParamsData, liveTallyData, votesData, depositsData, rawJsonData] =
          await Promise.all([
            getProposal(proposalId),
            getGovParams(),
            getProposalTally(proposalId),
            listVotes(proposalId),
            listDeposits(proposalId),
            getProposalRaw(proposalId),
          ]);
        if (!mounted) return;
        setProposal(proposalData);
        setGovParamsBundle(govParamsData);
        setLiveTally(liveTallyData);
        setVotes(votesData ?? []);
        setDeposits(depositsData ?? []);
        setRawJson(rawJsonData ?? {});
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [proposalId]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          제안 정보를 불러오는 중입니다
        </Typography>
        <Typography variant="body2" color="text.secondary">
          ID: {proposalId}
        </Typography>
      </Stack>
    );
  }

  if (!proposal) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          제안을 찾을 수 없습니다
        </Typography>
        <Typography variant="body2" color="text.secondary">
          ID: {proposalId}
        </Typography>
      </Stack>
    );
  }

  return (
    <GovernanceProposalDetail
      proposal={proposal}
      govParams={govParamsBundle}
      liveTally={liveTally}
      votes={votes ?? []}
      deposits={deposits ?? []}
      rawJson={rawJson ?? {}}
    />
  );
}
