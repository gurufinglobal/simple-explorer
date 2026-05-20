"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { GovernanceProposalsList } from "@/components/governance/governance-proposals-list";
import type { NormalizedProposal } from "@/lib/gov-types";
import { listProposals } from "@/services/guru/governance-query.service";

export default function GovernancePage() {
  const [proposals, setProposals] = useState<NormalizedProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const next = await listProposals();
        if (!mounted) return;
        setProposals(next);
        setError(null);
      } catch {
        if (!mounted) return;
        setProposals([]);
        setError("거버넌스 제안 목록을 불러오지 못했습니다.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
      {loading ? <CircularProgress size={22} /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      <GovernanceProposalsList initialProposals={proposals} />
    </Stack>
  );
}
