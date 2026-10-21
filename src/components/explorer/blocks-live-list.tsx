"use client";

import Link from "@/components/layout/chain-link";
import { useQuery } from "@/hooks/use-query";
import { PollingInfo } from "@/components/query/polling-info";
import { getLiveBlocks, type LiveHistory } from "@/services/guru/live-history.service";

import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useNowTick } from "@/hooks/use-now-tick";
import { formatRelativePastFromIso } from "@/lib/relative-time";
import type { BlockDetail } from "@/services/guru/block-details.service";

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
  const query = useQuery<LiveHistory<BlockDetail>>("blocks", getLiveBlocks, POLL_MS);
  const blocks = query.result.data?.rows ?? [];
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
          Blocks
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        현재 목록 평균 블록 생성 시간: {averageBlockTimeSec !== null ? `${averageBlockTimeSec.toFixed(2)}s` : "-"}
      </Typography>
      <PollingInfo {...query} />
      {blocks.length === 0 ? (
        (query.result.status === "success" || query.result.status === "empty") ? <Typography variant="body2">조회한 블록이 없습니다.</Typography> : null
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
                  {formatRelativePastFromIso(block.time, nowMs)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  Tx {block.txCount}
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
                  블록 hash (hex): {lcdBytesToHex(block.hash)?.slice(0, 10) ?? "미확인"}…
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Stack>
  );
}
