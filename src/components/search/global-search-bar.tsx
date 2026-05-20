"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { getAddressBalances } from "@/services/guru/address-profile.service";
import { getBlockDetail } from "@/services/guru/block-details.service";
import { getTxDetail } from "@/services/guru/tx-details.service";
import { classifyQuery } from "@/services/search/query-classifier";

type TxLookup = {
  hash: string;
  code: number;
  gasUsed: string;
  gasWanted: string;
  memo: string;
};

type AddressLookup = Array<{
  denom: string;
  amount: string;
}>;

type BlockLookup = {
  height: string;
  hash: string;
  time: string;
  proposer: string;
  txCount: number;
};

type LookupResponse =
  | { resolvedType: "txHash"; data: TxLookup }
  | { resolvedType: "address"; data: AddressLookup }
  | { resolvedType: "blockHeight"; data: BlockLookup }
  | { message: string; resolvedType?: "validator" | "token" };

export function GlobalSearchBar() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const resolved = classifyQuery(query.trim());

      if (resolved.resolvedType === "txHash") {
        const tx = await getTxDetail(query.trim());
        if (!tx) {
          setResult({ message: "트랜잭션 정보를 찾을 수 없습니다." });
        } else {
          setResult({ resolvedType: "txHash", data: tx });
        }
        return;
      }

      if (resolved.resolvedType === "address") {
        const balances = await getAddressBalances(query.trim());
        setResult({ resolvedType: "address", data: balances });
        return;
      }

      if (resolved.resolvedType === "blockHeight") {
        const block = await getBlockDetail(query.trim());
        if (!block) {
          setResult({ message: "블록 정보를 찾을 수 없습니다." });
        } else {
          setResult({ resolvedType: "blockHeight", data: block });
        }
        return;
      }

      setResult({
        resolvedType: resolved.resolvedType,
        message: `${resolved.resolvedType} 유형의 상세 조회는 아직 지원하지 않습니다.`,
      });
    } catch {
      setResult(null);
      setError("검색 결과를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">통합 검색</Typography>
          <form onSubmit={onSubmit}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="해시 / 주소 / 블록 높이"
              />
              <Button variant="contained" type="submit" disabled={loading}>
                {loading ? "조회 중..." : "검색"}
              </Button>
            </Stack>
          </form>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {!result ? <Typography data-testid="search-result">-</Typography> : null}

          {"resolvedType" in (result ?? {}) && result?.resolvedType === "txHash" ? (
            <Stack spacing={0.5} data-testid="search-result">
              <Typography variant="subtitle2">판별: txHash</Typography>
              <Typography variant="body2">해시: {result.data.hash}</Typography>
              <Typography variant="body2">코드: {result.data.code}</Typography>
              <Typography variant="body2">Gas Used: {result.data.gasUsed}</Typography>
              <Typography variant="body2">Gas Wanted: {result.data.gasWanted}</Typography>
              <Typography variant="body2">Memo: {result.data.memo || "-"}</Typography>
            </Stack>
          ) : null}

          {"resolvedType" in (result ?? {}) && result?.resolvedType === "address" ? (
            <Stack spacing={0.5} data-testid="search-result">
              <Typography variant="subtitle2">판별: address</Typography>
              {result.data.length === 0 ? (
                <Typography variant="body2">잔액 정보가 없습니다.</Typography>
              ) : (
                <List dense>
                  {result.data.map((balance) => (
                    <ListItem key={`${balance.denom}-${balance.amount}`}>
                      <ListItemText primary={`${balance.amount} ${balance.denom}`} />
                    </ListItem>
                  ))}
                </List>
              )}
            </Stack>
          ) : null}

          {"resolvedType" in (result ?? {}) && result?.resolvedType === "blockHeight" ? (
            <Stack spacing={0.5} data-testid="search-result">
              <Typography variant="subtitle2">판별: blockHeight</Typography>
              <Typography variant="body2">높이: {result.data.height}</Typography>
              <Typography variant="body2">해시: {result.data.hash}</Typography>
              <Typography variant="body2">시간: {result.data.time}</Typography>
              <Typography variant="body2">제안자: {result.data.proposer}</Typography>
              <Typography variant="body2">트랜잭션 수: {result.data.txCount}</Typography>
            </Stack>
          ) : null}

          {result && "message" in result ? (
            <Alert severity="info" data-testid="search-result">
              {result.message}
            </Alert>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
