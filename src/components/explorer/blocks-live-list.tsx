"use client";
import { useLocale, useTranslations } from "next-intl";


import Link from "@/components/layout/chain-link";
import { useQuery } from "@/hooks/use-query";
import { PollingInfo } from "@/components/query/polling-info";
import { getLiveBlocks, type LiveHistory } from "@/services/guru/live-history.service";

import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useNowTick } from "@/hooks/use-now-tick";
import { formatRelativePastFromIso } from "@/lib/relative-time";
import type { BlockSummary } from "@/services/guru/block-details.service";

import { lcdBytesToHex } from "@/lib/bytes";

const POLL_MS = 3000;

function hasTransactions(txCount: number | string): boolean {
  if (typeof txCount === "number") {
    return txCount > 0;
  }
  const parsed = Number(txCount);
  return Number.isFinite(parsed) && parsed > 0;
}

export function BlocksLiveList() {
  const t = useTranslations("explorer");
  const query = useQuery<LiveHistory<BlockSummary>>("blocks", getLiveBlocks, POLL_MS);
  const blocks = query.result.data?.rows ?? [];
  const locale = useLocale();
  const nowMs = useNowTick(POLL_MS);

  const averageBlockTimeSec = (() => {
    if (blocks.length < 2) {
      return null;
    }
    const timesMs = blocks
      .map((block) => Date.parse(block.time))
      .filter((ms) => Number.isFinite(ms));
    if (timesMs.length < 2) {
      return null;
    }
    let sumDiffMs = 0;
    let count = 0;
    for (let i = 0; i < timesMs.length - 1; i++) {
      const diff = timesMs[i] - timesMs[i + 1];
      if (diff > 0) {
        sumDiffMs += diff;
        count += 1;
      }
    }
    if (count === 0) {
      return null;
    }
    return Number(((sumDiffMs / count) / 1000).toFixed(2));
  })();

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>
           {t("blocks")} </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary">
         {t("average_block_time_in_the_current_list")} {averageBlockTimeSec !== null ? `${averageBlockTimeSec.toFixed(2)}s` : "-"}
      </Typography>
      <PollingInfo {...query} />
      {blocks.length === 0 ? (
        (query.result.status === "success" || query.result.status === "empty") ? <Typography variant="body2">{t("no_blocks_retrieved")}</Typography> : null
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              md: "repeat(3, minmax(0, 1fr))",
              lg: "repeat(5, minmax(0, 1fr))",
            },
          }}
        >
          {blocks.map((block) => (
            <Card
              key={block.height}
              component={Link}
              href={`/blocks/${block.height}`}
              variant="outlined"
              sx={{
                borderColor: hasTransactions(block.txCount) ? (theme) => alpha(theme.palette.primary.main, 0.28) : undefined,
                color: "inherit",
                textDecoration: "none",
                transition: "box-shadow 0.15s ease, border-color 0.15s ease",
                "&:hover": {
                  boxShadow: 2,
                  borderColor: "primary.main",
                },
              }}
            >
              <CardContent sx={{ py: 1.5, px: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="subtitle1" fontWeight={700} component="div" noWrap>
                  #{block.height}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                  {formatRelativePastFromIso(block.time, nowMs, locale)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                   {t("tx")} {block.txCount}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mt: 0.75,
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                    color: "text.secondary",
                    lineHeight: 1.3,
                  }}
                >
                   {t("block_hash_hex")} {lcdBytesToHex(block.hash)?.slice(0, 10) ?? t("unknown")}…
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Stack>
  );
}
