"use client";
import { Alert, Button, Stack, Typography } from '@mui/material';
import { useNowTick } from '@/hooks/use-now-tick';
import type { QueryResult } from '@/lib/query-result';

export function PageControls({ result, busy, hasMore, stopReason, loadMore, label = '목록' }: {
  result: QueryResult<unknown[]>; busy: boolean; hasMore: boolean; stopReason?: string; loadMore: () => void; label?: string;
}) {
  const now = useNowTick(1000);
  const wait = Math.max(0, Math.ceil(((result.error?.retryAt ?? 0) - now) / 1000));
  return <Stack spacing={1} aria-label={`${label} 페이지`}>
    <Typography variant="body2">{label}: 현재 조회 {result.data?.length ?? '미확인'}건 · 전체 개수 미확인</Typography>
    {stopReason && <Alert severity="warning">{stopReason}</Alert>}
    {hasMore && <Button onClick={loadMore} disabled={busy || wait > 0}>
      {busy ? `${label} 추가 조회 중` : wait ? `${wait}초 후 재시도` : result.status === 'stale' ? `${label} 추가 조회 재시도` : `${label} 이어보기`}
    </Button>}
    {!hasMore && !stopReason && result.data && !result.error && !busy && <Typography variant="caption">현재 조회 조건에서 다음 페이지가 제공되지 않았습니다.</Typography>}
  </Stack>;
}
