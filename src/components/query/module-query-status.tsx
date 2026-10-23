"use client";
import { useTranslations } from "next-intl";

import { QueryInfo } from './query-info';
import type { QueryStatusProps } from './query-status';

export function ModuleQueryStatus({ label: suppliedLabel, ...query }: QueryStatusProps & { label?: string }) {
  const t = useTranslations("query");
const label = suppliedLabel ?? t("module");

  return <QueryInfo label={t("query_information", { value0: label })} queries={[{ ...query, label }]} />;
}
