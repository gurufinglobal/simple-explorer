"use client";
import { LocalizedTime } from "@/components/explorer/localized-time";
import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("query");
  const st = useServiceText();
  const label = paused ? t("paused_hidden_tab") : result.error ? (result.data ? t("refresh_failed_stale_data") : t("query_failed")) : busy ? t("loading_refreshing") : recovered ? t("query_recovered") : t("query_complete");
  return <Stack spacing={1} component="section" aria-label={t("http_polling_query_information")} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
      <Typography variant="body2">{t("http_polling_3_seconds_after_a_successful_response")}</Typography>
      <Chip size="small" variant="outlined" label={label} sx={{ color: 'text.primary', borderColor: paused || result.error ? 'warning.main' : 'divider' }} />
    </Stack>
    <QueryStatus result={result} busy={busy || paused} refresh={refresh} compactLabel={t("list")} showDetails={false} />
    <Typography variant="caption" color="text.secondary">
       {t("last_api_success")} {result.observedAt ? <LocalizedTime value={result.observedAt} /> : t("none")}  {t("height")} {result.blockHeight ?? t("unknown")}  {t("chain")} {result.context.chain}
      {unchanged && t("unchangedHeight")}
    </Typography>
    {result.data && <Typography variant="body2" color="text.secondary">{st(result.data.scope)}</Typography>}
  </Stack>;
}
