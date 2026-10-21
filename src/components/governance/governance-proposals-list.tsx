"use client";

import Link from "@/components/layout/chain-link";
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import type { GovProposalStatus, NormalizedProposal } from "@/lib/gov-types";
import { tallyPercentages } from "@/lib/gov-mapper";
import { formatRelativeFutureOrPast } from "@/lib/relative-time";
import { useNowTick } from "@/hooks/use-now-tick";
import { getProposalTally } from "@/services/guru/governance-query.service";

const FILTER_ALL = "all" as const;
type FilterKey = typeof FILTER_ALL | GovProposalStatus;

const STATUS_LABEL: Record<GovProposalStatus, string> = {
  deposit_period: "예치",
  voting_period: "투표",
  passed: "가결",
  rejected: "부결",
  failed: "실패",
  unspecified: "기타",
};

function statusColor(status: GovProposalStatus): "default" | "primary" | "success" | "warning" | "error" {
  switch (status) {
    case "voting_period":
      return "primary";
    case "deposit_period":
      return "warning";
    case "passed":
      return "success";
    case "rejected":
    case "failed":
      return "error";
    default:
      return "default";
  }
}

type SortKey = "newest" | "ending";

type Props = {
  initialProposals: NormalizedProposal[];
};

export function GovernanceProposalsList({ initialProposals }: Props) {
  const [filter, setFilter] = useState<FilterKey>(FILTER_ALL);
  const [sort, setSort] = useState<SortKey>("newest");
  const [liveTallyByProposalId, setLiveTallyByProposalId] = useState<Record<string, NormalizedProposal["finalTally"]>>({});
  const nowMs = useNowTick(1000);

  useEffect(() => {
    let mounted = true;
    const votingIds = initialProposals
      .filter((proposal) => proposal.status === "voting_period")
      .map((proposal) => proposal.id);

    if (votingIds.length === 0) {
      setLiveTallyByProposalId({});
      return () => {
        mounted = false;
      };
    }

    void (async () => {
      const pairs = await Promise.all(
        votingIds.map(async (proposalId) => {
          const tally = await getProposalTally(proposalId);
          return [proposalId, tally] as const;
        }),
      );
      if (!mounted) return;

      const next: Record<string, NormalizedProposal["finalTally"]> = {};
      for (const [proposalId, tally] of pairs) {
        if (tally) {
          next[proposalId] = tally;
        }
      }
      setLiveTallyByProposalId(next);
    })();

    return () => {
      mounted = false;
    };
  }, [initialProposals]);

  const filtered = useMemo(() => {
    let list = [...initialProposals];
    if (filter !== FILTER_ALL) {
      list = list.filter((p) => p.status === filter);
    }
    list.sort((a, b) => {
      const na = BigInt(a.id || "0");
      const nb = BigInt(b.id || "0");
      if (sort === "newest") {
        return nb > na ? 1 : nb < na ? -1 : 0;
      }
      const endA = Date.parse(a.votingEndTime || a.depositEndTime || "") || 0;
      const endB = Date.parse(b.votingEndTime || b.depositEndTime || "") || 0;
      return endA - endB;
    });
    return list;
  }, [initialProposals, filter, sort]);

  const tabIndex =
    filter === FILTER_ALL
      ? 0
      : [
          "deposit_period",
          "voting_period",
          "passed",
          "rejected",
          "failed",
        ].indexOf(filter as GovProposalStatus) + 1;

  const handleTab = (_: React.SyntheticEvent, value: number) => {
    if (value === 0) {
      setFilter(FILTER_ALL);
      return;
    }
    const keys: GovProposalStatus[] = [
      "deposit_period",
      "voting_period",
      "passed",
      "rejected",
      "failed",
    ];
    setFilter(keys[value - 1] ?? FILTER_ALL);
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <Tabs value={tabIndex} onChange={handleTab} variant="scrollable" scrollButtons="auto">
          <Tab label="전체" />
          <Tab label="예치" />
          <Tab label="투표" />
          <Tab label="가결" />
          <Tab label="부결" />
          <Tab label="실패" />
        </Tabs>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="gov-sort-label">정렬</InputLabel>
          <Select
            labelId="gov-sort-label"
            label="정렬"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <MenuItem value="newest">최신순</MenuItem>
            <MenuItem value="ending">마감 임박</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          표시할 제안이 없습니다.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              md: "repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          {filtered.map((p) => {
            const mergedTally = liveTallyByProposalId[p.id] ?? p.finalTally;
            const tally = tallyPercentages(mergedTally);
            const endTime = p.votingEndTime || p.depositEndTime;
            return (
              <Card
                key={p.id}
                component={Link}
                href={`/governance/${p.id}`}
                variant="outlined"
                sx={{
                  textDecoration: "none",
                  color: "inherit",
                  "&:hover": { boxShadow: 2, borderColor: "primary.main" },
                }}
              >
                <CardContent sx={{ py: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      #{p.id}
                    </Typography>
                    <Chip size="small" label={STATUS_LABEL[p.status]} color={statusColor(p.status)} />
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }} noWrap title={p.title}>
                    {p.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    {endTime ? formatRelativeFutureOrPast(endTime, nowMs) : "—"}
                  </Typography>
                  {p.status === "voting_period" ? (
                    <Box sx={{ mt: 0.75 }}>
                      <Box
                        sx={{
                          height: 8,
                          borderRadius: 999,
                          overflow: "hidden",
                          display: "flex",
                          bgcolor: "action.disabledBackground",
                        }}
                        aria-label="proposal vote ratio bar"
                      >
                        <Box sx={{ width: `${Math.max(0, Math.min(100, tally.yes))}%`, bgcolor: "info.main" }} />
                        <Box sx={{ width: `${Math.max(0, Math.min(100, tally.no))}%`, bgcolor: "warning.main" }} />
                        <Box sx={{ width: `${Math.max(0, Math.min(100, tally.abstain))}%`, bgcolor: "grey.500" }} />
                      </Box>
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                        Yes {tally.yes.toFixed(1)}% · No {tally.no.toFixed(1)}% · Abstain {tally.abstain.toFixed(1)}%
                      </Typography>
                    </Box>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}
