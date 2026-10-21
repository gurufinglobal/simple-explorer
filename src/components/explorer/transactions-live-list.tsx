"use client";

import Link from "@/components/layout/chain-link";
import { useQuery } from "@/hooks/use-query";
import { PollingInfo } from "@/components/query/polling-info";
import { getLiveTransactions, type LiveHistory } from "@/services/guru/live-history.service";

import {
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { useNowTick } from "@/hooks/use-now-tick";
import { formatRelativePastFromIso } from "@/lib/relative-time";
import type { TxDetail } from "@/services/guru/tx-details.service";

const POLL_MS = 3000;

export function TransactionsLiveList() {
  const query = useQuery<LiveHistory<TxDetail>>("transactions", getLiveTransactions, POLL_MS);
  const txs = query.result.data?.rows ?? [];
  const nowMs = useNowTick(POLL_MS);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>
          Transactions
        </Typography>
      </Stack>
      <PollingInfo {...query} />
      <Card variant="outlined">
        <CardContent>
          {txs.length === 0 ? (
            query.result.data ? <Typography variant="body2">{query.result.error ? "마지막 성공 조회 범위에서 트랜잭션이 없었습니다." : "최근 조회 범위에서 트랜잭션이 없습니다."}</Typography> : null
          ) : (
            <List disablePadding>
              {txs.map((tx) => {
                const relative =
                  tx.timestamp && tx.timestamp.length > 0
                    ? formatRelativePastFromIso(tx.timestamp, nowMs)
                    : "—";
                return (
                  <ListItem
                    key={tx.hash}
                    component={Link}
                    href={`/tx/${tx.hash}`}
                    divider
                    sx={{ color: "inherit", textDecoration: "none", gap: 1 }}
                  >
                    <ListItemText
                      sx={{ minWidth: 0, overflowWrap: "anywhere" }}
                      primary={tx.hash}
                      secondary={`${relative} · Code: ${tx.code} | Gas: ${tx.gasUsed}/${tx.gasWanted} | Memo: ${tx.memo || "-"
                        }`}
                    />
                    <Chip
                      sx={{ flexShrink: 0 }}
                      label={tx.code === 0 ? "Success" : "Failed"}
                      color={tx.code === 0 ? "success" : "error"}
                      size="small"
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
