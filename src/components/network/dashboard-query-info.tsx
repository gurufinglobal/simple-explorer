"use client";
import { useTranslations } from "next-intl";

import { QueryInfo, type QueryInfoProps } from "@/components/query/query-info";

export function DashboardQueryInfo(props: QueryInfoProps) {
  const t = useTranslations("explorer");
  return <QueryInfo {...props} label={t("dashboard_query_information")} />;
}
