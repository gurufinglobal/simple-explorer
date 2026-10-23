"use client";
import { useLocale, useTranslations } from "next-intl";


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
export type FilterKey = typeof FILTER_ALL | GovProposalStatus;



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

export type SortKey = "newest" | "ending";

type Props = {
  initialProposals: NormalizedProposal[];
  available?: boolean;
  filterValue?: FilterKey;
  sortValue?: SortKey;
  onCriteriaChange?: (filter: FilterKey, sort: SortKey) => void;
};

export function GovernanceProposalsList({ initialProposals, available = true, filterValue, sortValue, onCriteriaChange }: Props) {
  const t = useTranslations("governance");
const STATUS_LABEL: Record<GovProposalStatus, string> = {
  deposit_period: t("deposits"),
  voting_period: t("votes"),
  passed: t("passed"),
  rejected: t("rejected"),
  failed: t("failed"),
  unspecified: t("other"),
};

  const [localFilter, setFilter] = useState<FilterKey>(FILTER_ALL);
  const [localSort, setSort] = useState<SortKey>("newest");
  const filter = filterValue ?? localFilter;
  const sort = sortValue ?? localSort;
  const [liveTallyByProposalId, setLiveTallyByProposalId] = useState<Record<string, NormalizedProposal["finalTally"]>>({});
  const locale = useLocale();
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
      onCriteriaChange?.(FILTER_ALL, sort);
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
    onCriteriaChange?.(keys[value - 1] ?? FILTER_ALL, sort);
  };

  return (
    <Stack spacing={2}>
      <Typography variant="body2">{t("filtering_and_sorting_apply_only_to_the_retrieved_list")}</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <Tabs value={tabIndex} onChange={handleTab} variant="scrollable" scrollButtons="auto">
          <Tab label={t("all")} />
          <Tab label={t("deposits")} />
          <Tab label={t("votes")} />
          <Tab label={t("passed")} />
          <Tab label={t("rejected")} />
          <Tab label={t("failed")} />
        </Tabs>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="gov-sort-label">{t("sort")}</InputLabel>
          <Select
            labelId="gov-sort-label"
            label={t("sort")}
            value={sort}
            onChange={(e) => { setSort(e.target.value as SortKey); onCriteriaChange?.(filter, e.target.value as SortKey); }}
          >
            <MenuItem value="newest">{t("newest")}</MenuItem>
            <MenuItem value="ending">{t("ending_soon")}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {available ? t("no_proposals_to_display") : t("proposal_list_unknown_check_query_status")}
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
                  <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }} noWrap title={p.titleMissing ? t("proposalTitle", { id: p.id }) : p.title}>
                    {p.titleMissing ? t("proposalTitle", { id: p.id }) : p.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    {endTime ? formatRelativeFutureOrPast(endTime, nowMs, locale) : "—"}
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
                        aria-label={t("proposal_vote_ratio_chart")}
                      >
                        <Box sx={{ width: `${Math.max(0, Math.min(100, tally.yes))}%`, bgcolor: "info.main" }} />
                        <Box sx={{ width: `${Math.max(0, Math.min(100, tally.no))}%`, bgcolor: "warning.main" }} />
                        <Box sx={{ width: `${Math.max(0, Math.min(100, tally.abstain))}%`, bgcolor: "grey.500" }} />
                      </Box>
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                         {t("yes")} {tally.yes.toFixed(1)}{t("no_3")} {tally.no.toFixed(1)}{t("abstain_3")} {tally.abstain.toFixed(1)}%
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
