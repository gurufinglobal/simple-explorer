"use client";
import { Alert, Button, Stack, Typography } from '@mui/material';
import { useNowTick } from '@/hooks/use-now-tick';
import type { QueryResult } from '@/lib/query-result';

export type QueryStatusProps = { result: QueryResult<unknown>; busy?: boolean; refresh?: () => void };

export function QueryStatus({ result, busy, refresh, compactLabel, showDetails = true }: QueryStatusProps & { compactLabel?: string; showDetails?: boolean }) {
  const now = useNowTick(1000);
  const wait = Math.max(0, Math.ceil(((result.error?.retryAt ?? 0) - now) / 1000));
  const labels = { idle: '미조회', loading: '불러오는 중', success: '조회 완료', empty: '조회 완료: 빈 결과', 'not-found': '확인된 미존재', partial: '일부 조회 실패', stale: '갱신 실패: 마지막 조회 데이터', error: '조회 실패', unsupported: '미지원', cancelled: '조회 취소' };
  const status = <Typography variant="body2" role="status">{result.status === "idle" && busy ? "불러오는 중" : labels[result.status]}</Typography>;
  const retry = refresh && <Button size="small" onClick={refresh} disabled={busy || wait > 0} aria-label={compactLabel ? `${compactLabel} 다시 조회` : undefined}>
    {wait > 0 ? `${wait}초 후 재시도` : '다시 조회'}
  </Button>;
  return <Stack spacing={1} data-query-status={result.status} sx={compactLabel ? { minWidth: 0, overflowWrap: 'anywhere' } : undefined}>
    {compactLabel ? <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
      <Typography variant="body2" fontWeight={700}>{compactLabel}</Typography>
      {status}
      {retry}
    </Stack> : status}
    {result.error && <Alert severity={result.status === 'partial' || result.status === 'stale' ? 'warning' : 'error'}>
      {result.error.message} ({result.error.kind})
      {result.error.causes && result.error.causes.length > 1 && ` · ${result.error.causes.length}개 요청 실패: ${result.error.causes.map(error => error.status ? `HTTP ${error.status}` : error.kind).join(", ")}`}
      {result.error.kind === "http" && result.error.status === 404 && ' 조회 범위 밖이거나 아직 확인되지 않은 대상일 수 있습니다. 미지원 또는 거래 실패로 확정하지 않습니다.'}
    </Alert>}
    {compactLabel && showDetails ? <Typography variant="caption" color="text.secondary">
      체인: {result.context.chain} · 대상: {result.context.target}<br />
      데이터 관찰 시각: {result.observedAt ?? '아직 관찰된 데이터 없음'}{result.blockHeight ? ` · 높이 ${result.blockHeight}` : ''}
    </Typography> : !compactLabel && result.observedAt && <Typography variant="caption">조회 시각: {result.observedAt} · {result.context.chain} · {result.context.target}{result.blockHeight ? ` · 높이 ${result.blockHeight}` : ''}</Typography>}
    {!compactLabel && retry}
  </Stack>;
}
