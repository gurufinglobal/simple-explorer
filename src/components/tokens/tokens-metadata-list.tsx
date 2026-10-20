"use client";

import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import {
  Card,
  CardContent,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { getDenomsMetadata } from "@/services/guru/token-metadata.service";

export function TokensMetadataList() {
  const query = useQuery("tokens", client => getDenomsMetadata(client));
  const items = query.result.data ?? [];
  const loading = query.busy && !query.result.data;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        Tokens
      </Typography>
      <Typography variant="body2" color="text.secondary">
        `/cosmos/bank/v1beta1/denoms_metadata` 결과를 기준으로 표시합니다.
      </Typography>

      <QueryStatus {...query} />

      {loading ? (
        <Card variant="outlined">
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Display</TableCell>
                  <TableCell>Base Denom</TableCell>
                  <TableCell align="right">Decimals</TableCell>
                  <TableCell>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`token-skeleton-${index}`}>
                    <TableCell><Skeleton variant="text" width={70} /></TableCell>
                    <TableCell><Skeleton variant="text" width={90} /></TableCell>
                    <TableCell><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell><Skeleton variant="text" width={110} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={30} sx={{ ml: "auto" }} /></TableCell>
                    <TableCell><Skeleton variant="text" width="80%" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        query.result.status === "empty" ? <Typography variant="body2">표시할 토큰 메타데이터가 없습니다.</Typography> : null
      ) : (
        <Card variant="outlined">
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Display</TableCell>
                  <TableCell>Base Denom</TableCell>
                  <TableCell align="right">Decimals</TableCell>
                  <TableCell>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.baseDenom}>
                    <TableCell>{item.symbol}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.displayDenom}</TableCell>
                    <TableCell>{item.baseDenom}</TableCell>
                    <TableCell align="right">{item.decimals ?? "정밀도 미확인"}</TableCell>
                    <TableCell>{item.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
