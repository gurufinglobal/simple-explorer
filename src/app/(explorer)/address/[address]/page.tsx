"use client";

import { CopyPageLink, CopyValue } from "@/components/explorer/copy-value";
import { AddressTransactions } from "@/components/explorer/address-transactions";

import { useQuery } from "@/hooks/use-query";
import { QueryInfo } from "@/components/query/query-info";

import { useParams } from "next/navigation";
import {
  Alert,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import {
  getAddressAccountInfo,
  getAddressBalances,
} from "@/services/guru/address-profile.service";


import { CoinAmount } from "@/components/amount/coin-amount";
import { getDenomsMetadata } from "@/services/guru/token-metadata.service";
import { getWalletPortfolio } from "@/services/guru/wallet-portfolio.service";
import { UnbondingDetails } from "@/components/amount/unbonding-details";
import { canonicalAccountAddress } from "@/lib/canonical-address";
import { getActiveChainConfig } from "@/lib/chain-selection";


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
  const metadata = useQuery("address-metadata", client => getDenomsMetadata(client));
  const portfolio = useQuery(`address-portfolio:${address}`, client => getWalletPortfolio(address, client));
  const balances = bank.result.data ?? [];
  const accountInfo = account.result.data ?? { accountNumber: null, sequence: null };
  const profileLoading = bank.busy && !bank.result.data;

  return (
    <Stack spacing={2}>
      <CopyPageLink />
      <Typography variant="h5" fontWeight={700}>
        Address Details
      </Typography>
      <QueryInfo label="주소 조회 정보" queries={[{ ...account, label: "계정" }, { ...bank, label: "잔액" }, { ...metadata, label: "토큰 메타데이터" }, { ...portfolio, label: "위임과 보상" }]} />
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography>Address (canonical Bech32): {address}</Typography>
            <CopyValue label="계정 주소 Bech32 복사" value={address} />

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


      <Typography>위임: {portfolio.result.data?.staking ?? "미확인"} · 보상: {portfolio.result.data?.reward ?? "미확인"}</Typography>
      <Stack component="section" aria-label="위임 원본 금액">
        {portfolio.result.data?.details?.staking?.map(coin => <CoinAmount key={coin.denom} coin={coin} metadata={portfolio.result.data?.details?.metadata} />)}
      </Stack>
      {portfolio.result.data?.details?.reward?.map(coin => <CoinAmount key={coin.denom} coin={coin} metadata={metadata.result.data ?? []} />)}
      {portfolio.result.data?.details?.unbonding && <UnbondingDetails snapshot={portfolio.result.data.details.unbonding} duration={portfolio.result.data.details.unbondingTime} metadata={metadata.result.data ?? []} />}
      <Card variant="outlined">
        <CardContent>
          <AddressTransactions address={address} />
        </CardContent>
      </Card>
    </Stack>
  );
}
