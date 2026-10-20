"use client";
import { Alert, Button, Stack, Typography } from '@mui/material';
import { useNowTick } from '@/hooks/use-now-tick';
import type { QueryResult } from '@/lib/query-result';

export function QueryStatus({ result, busy, refresh }: { result: QueryResult<unknown>; busy?: boolean; refresh?: () => void }) {
  const now = useNowTick(1000);
  const wait = Math.max(0, Math.ceil(((result.error?.retryAt ?? 0) - now) / 1000));
  const labels = { idle: '미조회', loading: '불러오는 중', success: '조회 완료', empty: '조회 완료: 빈 결과', 'not-found': '확인된 미존재', partial: '일부 조회 실패', stale: '갱신 실패: 마지막 조회 데이터', error: '조회 실패', unsupported: '미지원', cancelled: '조회 취소' };
  return <Stack spacing={1} data-query-status={result.status}>
    <Typography variant="body2" role="status">{result.status === "idle" && busy ? "불러오는 중" : labels[result.status]}</Typography>
    {result.error && <Alert severity={result.status === 'partial' || result.status === 'stale' ? 'warning' : 'error'}>
      {result.error.message} ({result.error.kind})
      {result.error.causes && result.error.causes.length > 1 && ` · ${result.error.causes.length}개 요청 실패: ${result.error.causes.map(error => error.status ? `HTTP ${error.status}` : error.kind).join(", ")}`}
      {result.error.kind === "http" && result.error.status === 404 && ' 조회 범위 밖이거나 아직 확인되지 않은 대상일 수 있습니다. 미지원 또는 거래 실패로 확정하지 않습니다.'}
    </Alert>}
    {result.observedAt && <Typography variant="caption">조회 시각: {result.observedAt} · {result.context.chain} · {result.context.target}{result.blockHeight ? ` · 높이 ${result.blockHeight}` : ''}</Typography>}
    {refresh && <Button size="small" onClick={refresh} disabled={busy || wait > 0}>{wait > 0 ? `${wait}초 후 재시도` : '다시 조회'}</Button>}
  </Stack>;
}
