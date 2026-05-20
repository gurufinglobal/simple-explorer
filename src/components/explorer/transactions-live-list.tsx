"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
const FETCH_LIMIT = 30;
const MAX_TXS = 150;

type Props = {
  initialTxs?: TxDetail[];
};

export function TransactionsLiveList({ initialTxs = [] }: Props) {
  const [txs, setTxs] = useState<TxDetail[]>(initialTxs);
  const [liveError, setLiveError] = useState<string | null>(null);
  const nowMs = useNowTick(POLL_MS);
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/transactions")) {
      return;
    }

    let mounted = true;

    const syncLatest = async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      try {
        const fresh = await getRecentTransactions(FETCH_LIMIT);
        if (!mounted) return;
        setTxs((prev) => {
          const seen = new Set(prev.map((t) => t.hash));
          const newOnes = fresh.filter((t) => !seen.has(t.hash));
          if (newOnes.length === 0) {
            return prev;
          }
          return [...newOnes, ...prev].slice(0, MAX_TXS);
        });
        setLiveError(null);
      } catch {
        if (!mounted) return;
        setLiveError("실시간 트랜잭션 갱신 중 오류가 발생했습니다.");
      }
    };

    void syncLatest();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncLatest();
      }
    };
    const id = window.setInterval(() => {
      void syncLatest();
    }, POLL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>
          Transactions
        </Typography>
        <Chip
          size="small"
          color={liveError ? "warning" : "success"}
          label={liveError ? "Live paused" : "Live (3s)"}
        />
      </Stack>
      {liveError ? (
        <Typography variant="body2" color="warning.main">
          {liveError}
        </Typography>
      ) : null}
      <Card variant="outlined">
        <CardContent>
          {txs.length === 0 ? (
            <Typography variant="body2">트랜잭션 데이터를 불러오지 못했습니다.</Typography>
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
                      secondary={`${relative} · Code: ${tx.code} | Gas: ${tx.gasUsed}/${tx.gasWanted} | Memo: ${
                        tx.memo || "-"
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
