"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Pagination,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import {
  getAddressAccountInfo,
  getAddressBalances,
  type AddressAccountInfo,
  type AddressBalance,
} from "@/services/guru/address-profile.service";
import { getTransactionsByAddress } from "@/services/guru/transactions.service";
import type { TxDetail } from "@/services/guru/tx-details.service";

type AddressBalanceDisplay = {
  amount: string;
  denomLabel: string;
};

const TRANSACTIONS_PAGE_SIZE = 15;

function shortenIbcHash(denom: string): string {
  const hash = denom.slice(4);
  if (hash.length <= 14) {
    return denom;
  }
  return `ibc/${hash.slice(0, 6)}...${hash.slice(-6)}`;
}

async function buildBalanceDisplayRows(balances: AddressBalance[]): Promise<AddressBalanceDisplay[]> {
  return Promise.all(
    balances.map(async (balance) => {
      if (!balance.denom.startsWith("ibc/")) {
        return {
          amount: balance.amount,
          denomLabel: balance.denom,
        };
      }

      return {
        amount: balance.amount,
        denomLabel: shortenIbcHash(balance.denom),
      };
    }),
  );
}

export default function AddressDetailPage() {
  const params = useParams<{ address: string }>();
  const address = params.address ?? "";
  const [balances, setBalances] = useState<AddressBalance[]>([]);
  const [balanceDisplayRows, setBalanceDisplayRows] = useState<AddressBalanceDisplay[]>([]);
  const [accountInfo, setAccountInfo] = useState<AddressAccountInfo>({
    accountNumber: null,
    sequence: null,
  });
  const [transactions, setTransactions] = useState<TxDetail[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [txPage, setTxPage] = useState(1);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setProfileLoading(true);
      try {
        const [nextBalances, nextAccountInfo] = await Promise.all([
          getAddressBalances(address),
          getAddressAccountInfo(address),
        ]);
        const nextBalanceDisplayRows = await buildBalanceDisplayRows(nextBalances);
        if (!mounted) return;
        setBalances(nextBalances);
        setBalanceDisplayRows(nextBalanceDisplayRows);
        setAccountInfo(nextAccountInfo);
      } finally {
        if (!mounted) return;
        setProfileLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [address]);

  useEffect(() => {
    let mounted = true;
    setTransactionsLoading(true);
    setTxPage(1);
    void (async () => {
      try {
        const nextTransactions = await getTransactionsByAddress(address, 200);
        if (!mounted) return;
        setTransactions(nextTransactions);
      } finally {
        if (!mounted) return;
        setTransactionsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [address]);

  const txPageCount = useMemo(
    () => Math.max(1, Math.ceil(transactions.length / TRANSACTIONS_PAGE_SIZE)),
    [transactions.length],
  );
  const pagedTransactions = useMemo(() => {
    const start = (txPage - 1) * TRANSACTIONS_PAGE_SIZE;
    return transactions.slice(start, start + TRANSACTIONS_PAGE_SIZE);
  }, [transactions, txPage]);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        Address Details
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography>Address: {address}</Typography>
            <Typography>Account Number: {accountInfo.accountNumber ?? "-"}</Typography>
            <Typography>Sequence: {accountInfo.sequence ?? "-"}</Typography>
            <Typography variant="subtitle2">Balances</Typography>
            {profileLoading ? (
              <Stack spacing={1}>
                <Skeleton variant="text" width={180} />
                <Skeleton variant="text" width={220} />
                <Skeleton variant="text" width={160} />
              </Stack>
            ) : balances.length === 0 ? (
              <Typography>Could not load balance information.</Typography>
            ) : (
              <List dense>
                {balanceDisplayRows.map((row) => (
                  <ListItem key={`${row.denomLabel}-${row.amount}`}>
                    <ListItemText primary={`${row.amount} ${row.denomLabel}`} />
                  </ListItem>
                ))}
              </List>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="subtitle2">Related Transactions</Typography>
            {transactionsLoading ? (
              <Stack spacing={0.75}>
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={`tx-skeleton-${index}`} variant="rounded" height={42} />
                ))}
              </Stack>
            ) : transactions.length === 0 ? (
              <Typography>No related transactions found.</Typography>
            ) : (
              <>
                <List dense disablePadding>
                  {pagedTransactions.map((tx) => (
                    <ListItem key={tx.hash} disablePadding>
                      <ListItemButton component={Link} href={`/tx/${tx.hash}`}>
                        <ListItemText
                          primary={tx.hash}
                          secondary={`Height: ${tx.height} · Gas: ${tx.gasUsed}/${tx.gasWanted}`}
                        />
                        <Chip
                          label={tx.code === 0 ? "Success" : "Failed"}
                          color={tx.code === 0 ? "success" : "error"}
                          size="small"
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
                <Stack direction="row" justifyContent="center" sx={{ pt: 1 }}>
                  <Pagination
                    page={txPage}
                    count={txPageCount}
                    onChange={(_, nextPage) => setTxPage(nextPage)}
                    size="small"
                    color="primary"
                  />
                </Stack>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
