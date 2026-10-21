"use client";
import { QueryInfo } from './query-info';
import type { QueryStatusProps } from './query-status';

export function ModuleQueryStatus({ label = "모듈", ...query }: QueryStatusProps & { label?: string }) {
  return <QueryInfo label={`${label} 조회 정보`} queries={[{ ...query, label }]} />;
}
