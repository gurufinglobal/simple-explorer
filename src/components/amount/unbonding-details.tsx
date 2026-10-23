"use client";
import { LocalizedTime } from "@/components/explorer/localized-time";
import { useTranslations } from "next-intl";

import type { UnbondingSnapshot } from "@/services/guru/unbonding.service";
import type { AmountMetadata } from "@/lib/cosmos-amount";
import { CoinAmount } from "./coin-amount";
export function UnbondingDetails({ snapshot, duration, metadata }: { snapshot: UnbondingSnapshot; duration?: string; metadata?: AmountMetadata[] }) {
  const t = useTranslations("transaction");
  return <details><summary>{t("unbonding_details")}</summary>
    <p>{t("current_unbonding_period")} {duration ?? t("unknown")}  {t("total_observed_at_height")} {snapshot.queryHeight ?? t("unknown_missing_header_or_inconsistent_page_heights")}</p>
    <CoinAmount coin={snapshot.total} metadata={metadata} />
    <p>{t("completion_times_come_from_the_chain_response_a_past")}</p>
    <ul>{snapshot.entries.map((entry, i) => <li key={i}>
      {entry.validator} · <CoinAmount coin={entry} metadata={metadata} />  {t("expected_completion")} {entry.completionTime ? <LocalizedTime value={entry.completionTime} /> : t("unknown")}  {t("observed_height")} {entry.queryHeight ?? t("unknown")}  {t("creation_height")} {entry.creationHeight ?? t("unknown")}
    </li>)}</ul>
  </details>;
}
