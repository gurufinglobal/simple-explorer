"use client";
import { Chip, Stack, Typography } from '@mui/material';
import { QueryStatus, type QueryStatusProps } from './query-status';
import type { LiveHistory } from '@/services/guru/live-history.service';
import type { QueryResult } from '@/lib/query-result';

type Props = Omit<QueryStatusProps, 'result'> & {
  result: QueryResult<LiveHistory<unknown>>;
  paused: boolean;
  recovered: boolean;
  unchanged: boolean;
};
export function PollingInfo({ result, busy, paused, recovered, unchanged, refresh }: Props) {
  const label = paused ? '일시 중지: 숨긴 탭' : result.error ? (result.data ? '갱신 실패 · 오래된 데이터' : '조회 실패') : busy ? '불러오는 중 · 갱신 중' : recovered ? '조회 복구' : '조회 완료';
  return <Stack spacing={1} component="section" aria-label="HTTP 폴링 조회 정보" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
      <Typography variant="body2">HTTP polling · 정상 응답 완료 후 3초</Typography>
      <Chip size="small" variant="outlined" label={label} sx={{ color: 'text.primary', borderColor: paused || result.error ? 'warning.main' : 'divider' }} />
    </Stack>
    <QueryStatus result={result} busy={busy || paused} refresh={refresh} compactLabel="목록" showDetails={false} />
    <Typography variant="caption" color="text.secondary">
      마지막 API 성공: {result.observedAt ?? '없음'} · 높이 {result.blockHeight ?? '미확인'} · 체인 {result.context.chain}
      {unchanged && ' · 직전 성공 조회와 높이 동일 (체인 진행 여부는 별도 확인 필요)'}
    </Typography>
    {result.data && <Typography variant="body2" color="text.secondary">{result.data.scope}</Typography>}
  </Stack>;
}
