"use client";
import { QueryInfo, type QueryInfoProps } from "@/components/query/query-info";

export function DashboardQueryInfo(props: QueryInfoProps) {
  return <QueryInfo {...props} label="Dashboard 조회 정보" />;
}
