"use client";
import { Stack, Typography } from '@mui/material';
import { QueryStatus, type QueryStatusProps } from './query-status';

export function ModuleQueryStatus(props: QueryStatusProps) {
  return <Stack spacing={1} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <QueryStatus {...props} />
    {props.result.observations?.map((item, index) => <Typography key={index} variant="caption">
      출처: {item.endpoint} · 관찰: {item.observedAt} · 응답 높이: {item.blockHeight ?? '미확인'}
    </Typography>)}
  </Stack>;
}
