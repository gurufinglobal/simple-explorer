"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

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
} from "@/services/guru/address-profile.service";
import { getTransactionsByAddress } from "@/services/guru/transactions.service";

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

export default function AddressDetailPage() {
  const params = useParams<{ address: string }>();
  const address = params.address ?? "";
  const bank = useQuery(`balances:${address}`, client => getAddressBalances(address, client));
  const account = useQuery(`account:${address}`, client => getAddressAccountInfo(address, client));
  const txQuery = useQuery(`address-transactions:${address}`, client => getTransactionsByAddress(address, 200, client));
  const balances = bank.result.data ?? [];
  const balanceDisplayRows: AddressBalanceDisplay[] = balances.map(balance => ({ amount: balance.amount, denomLabel: balance.denom.startsWith("ibc/") ? shortenIbcHash(balance.denom) : balance.denom }));
  const accountInfo = account.result.data ?? { accountNumber: null, sequence: null };
  const transactions = useMemo(() => txQuery.result.data ?? [], [txQuery.result.data]);
  const profileLoading = bank.busy && !bank.result.data;
  const transactionsLoading = txQuery.busy && !txQuery.result.data;
  const [txPage, setTxPage] = useState(1);

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
      <QueryStatus {...txQuery} />
      <Typography variant="h5" fontWeight={700}>
        Address Details
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography>Address: {address}</Typography>
            <QueryStatus {...account} />
            <Typography>Account Number: {accountInfo.accountNumber ?? "-"}</Typography>
            <Typography>Sequence: {accountInfo.sequence ?? "-"}</Typography>
            <Typography variant="subtitle2">Balances</Typography>
            <QueryStatus {...bank} />
            {profileLoading ? (
              <Stack spacing={1}>
                <Skeleton variant="text" width={180} />
                <Skeleton variant="text" width={220} />
                <Skeleton variant="text" width={160} />
              </Stack>
            ) : balances.length === 0 ? (
              bank.result.status === "empty" ? <Typography>잔액 조회 완료: 보유 코인이 없습니다.</Typography> : null
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
              txQuery.result.status === "empty" ? <Typography>조회 범위에 거래가 없습니다.</Typography> : null
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
