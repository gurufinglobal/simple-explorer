"use client";

import { CopyPageLink, CopyValue } from "@/components/explorer/copy-value";
import Link from "@/components/layout/chain-link";
import { useMemo, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useParams } from "next/navigation";
import {
  Alert,
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

import { CoinAmount } from "@/components/amount/coin-amount";
import { getDenomsMetadata } from "@/services/guru/token-metadata.service";
import { getWalletPortfolio } from "@/services/guru/wallet-portfolio.service";
import { UnbondingDetails } from "@/components/amount/unbonding-details";
import { canonicalAccountAddress } from "@/lib/canonical-address";
import { getActiveChainConfig } from "@/lib/chain-selection";
const TRANSACTIONS_PAGE_SIZE = 15;

export default function AddressDetailPage() {
  const params = useParams<{ address: string }>();
  let address: string;
  try { address = canonicalAccountAddress(params.address ?? "", getActiveChainConfig()); }
  catch (error) { return <Alert severity="error">{(error as Error).message}</Alert>; }
  return <AddressDetailContent key={address} address={address} />;
}
function AddressDetailContent({ address }: { address: string }) {
  const bank = useQuery(`balances:${address}`, client => getAddressBalances(address, client));
  const account = useQuery(`account:${address}`, client => getAddressAccountInfo(address, client));
  const txQuery = useQuery(`address-transactions:${address}`, client => getTransactionsByAddress(address, 200, client));
  const metadata = useQuery("address-metadata", client => getDenomsMetadata(client));
  const portfolio = useQuery(`address-portfolio:${address}`, client => getWalletPortfolio(address, client));
  const balances = bank.result.data ?? [];
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
      <CopyPageLink />
      <QueryStatus {...txQuery} />
      <Typography variant="h5" fontWeight={700}>
        Address Details
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography>Address (canonical Bech32): {address}</Typography>
            <CopyValue label="계정 주소 Bech32 복사" value={address} />
            <QueryStatus {...account} />
            <Typography>Account Number: {accountInfo.accountNumber ?? "-"}</Typography>
            <Typography>Sequence: {accountInfo.sequence ?? "-"}</Typography>
            <Typography variant="subtitle2">Balances</Typography>
            <QueryStatus {...bank} /><QueryStatus {...metadata} />
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
                {balances.map((row) => (
                  <ListItem key={`${row.denom}-${row.amount}`}>
                    <ListItemText disableTypography primary={<CoinAmount coin={row} metadata={metadata.result.data ?? []} />} />
                  </ListItem>
                ))}
              </List>
            )}
          </Stack>
        </CardContent>
      </Card>

      <QueryStatus {...portfolio} />
      <Typography>위임: {portfolio.result.data?.staking ?? "미확인"} · 보상: {portfolio.result.data?.reward ?? "미확인"}</Typography>
      <Stack component="section" aria-label="위임 원본 금액">
        {portfolio.result.data?.details?.staking?.map(coin => <CoinAmount key={coin.denom} coin={coin} metadata={portfolio.result.data?.details?.metadata} />)}
      </Stack>
      {portfolio.result.data?.details?.reward?.map(coin => <CoinAmount key={coin.denom} coin={coin} metadata={metadata.result.data ?? []} />)}
      {portfolio.result.data?.details?.unbonding && <UnbondingDetails snapshot={portfolio.result.data.details.unbonding} duration={portfolio.result.data.details.unbondingTime} metadata={metadata.result.data ?? []} />}
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
