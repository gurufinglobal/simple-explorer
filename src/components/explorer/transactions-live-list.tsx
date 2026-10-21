"use client";

import Link from "@/components/layout/chain-link";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

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
import { getRecentTransactions } from "@/services/guru/transactions.service";

const POLL_MS = 3000;
const MAX_TXS = 150;

export function TransactionsLiveList() {
  const query = useQuery<TxDetail[]>("transactions", async (client, previous) => {
    const fresh = await getRecentTransactions(30, client);
    const seen = new Set((previous ?? []).map(tx => tx.hash));
    return [...fresh.filter(tx => !seen.has(tx.hash)), ...(previous ?? [])].slice(0, MAX_TXS);
  }, POLL_MS);
  const txs = query.result.data ?? [];
  const nowMs = useNowTick(POLL_MS);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>
          Transactions
        </Typography>
        <Chip
          size="small"
          color={query.result.status === "success" || query.result.status === "empty" ? "success" : "warning"}
          label={query.result.status === "success" || query.result.status === "empty" ? "Live (3s)" : query.busy ? "불러오는 중" : "Live paused"}
        />
      </Stack>
      <QueryStatus {...query} />
      <Card variant="outlined">
        <CardContent>
          {txs.length === 0 ? (
            query.result.status === "empty" ? <Typography variant="body2">최근 조회 범위에서 트랜잭션이 없습니다.</Typography> : null
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
                    sx={{ color: "inherit", textDecoration: "none" }}
                  >
                    <ListItemText
                      primary={tx.hash}
                      secondary={`${relative} · Code: ${tx.code} | Gas: ${tx.gasUsed}/${tx.gasWanted} | Memo: ${tx.memo || "-"
                        }`}
                    />
                    <Chip
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
