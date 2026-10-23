"use client";
import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";

import { Alert, Button, Stack, Typography } from '@mui/material';
import { useNowTick } from '@/hooks/use-now-tick';
import type { QueryResult } from '@/lib/query-result';

export function PageControls({ result, busy, hasMore, stopReason, loadMore, label: suppliedLabel }: {
  result: QueryResult<unknown[]>; busy: boolean; hasMore: boolean; stopReason?: string; loadMore: () => void; label?: string;
}) {
  const t = useTranslations("query");
  const st = useServiceText();
const label = suppliedLabel ?? t("list");

  const now = useNowTick(1000);
  const wait = Math.max(0, Math.ceil(((result.error?.retryAt ?? 0) - now) / 1000));
  return <Stack spacing={1} aria-label={t("pages", { value0: label })}>
    <Typography variant="body2">{t("retrievedRecords", { label, count: result.data?.length ?? t("unknown") })}</Typography>
    {stopReason && <Alert severity="warning">{st(stopReason)}</Alert>}
    {hasMore && <Button onClick={loadMore} disabled={busy || wait > 0}>
      {busy ? t("loading_more", { value0: label }) : wait ? t("retry_in_seconds", { value0: wait }) : result.status === 'stale' ? t("retry_loading_more", { value0: label }) : t("load_more", { value0: label })}
    </Button>}
    {!hasMore && !stopReason && result.data && !result.error && !busy && <Typography variant="caption">{t("no_next_page_was_provided_for_the_current_query")}</Typography>}
  </Stack>;
}
