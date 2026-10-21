"use client";
import { Alert, Chip, List, ListItem, ListItemButton, ListItemText, Stack, Typography } from '@mui/material';
import Link from '@/components/layout/chain-link';
import { useAddressTransactions } from '@/hooks/use-address-transactions';
import { QueryStatus } from '@/components/query/query-status';
import { PageControls } from '@/components/query/page-controls';

export function AddressTransactions({ address }: { address: string }) {
  const query = useAddressTransactions(address);
  return <Stack spacing={1}>
    <Typography variant="subtitle2">Related Transactions</Typography>
    <Typography variant="body2">인덱싱된 sender/recipient 관련 거래입니다. 전체 EVM/internal history는 포함하지 않습니다. 높이 내림차순, 동일 높이는 hash 오름차순으로 표시합니다.</Typography>
    <Stack component="section" aria-label="송신 거래"><QueryStatus {...query.sender} /><PageControls {...query.sender} label="송신" /></Stack>
    <Stack component="section" aria-label="수신 거래"><QueryStatus {...query.recipient} /><PageControls {...query.recipient} label="수신" /></Stack>
    {query.partial && <Alert severity="warning">송수신 일부 범위만 조회되었습니다. 재시도 시 행 순서가 바뀔 수 있습니다.</Alert>}
    {query.buffered > 0 && <Typography>정렬 경계에서 {query.buffered}건 보관 중입니다. 송수신 이어보기로 다음 높이를 확인하세요.</Typography>}
    {!query.loading && !query.partial && !query.rows.length && !query.buffered && <Typography>조회 범위에 거래가 없습니다.</Typography>}
    <List dense disablePadding>{query.rows.map(tx => <ListItem key={tx.hash} disablePadding>
      <ListItemButton component={Link} href={`/tx/${tx.hash}`}>
        <ListItemText primary={tx.hash} secondary={`Height: ${tx.height} · Gas: ${tx.gasUsed}/${tx.gasWanted}`} />
        <Chip label={tx.code === 0 ? 'Success' : 'Failed'} color={tx.code === 0 ? 'success' : 'error'} size="small" />
      </ListItemButton>
    </ListItem>)}</List>
  </Stack>;
}
