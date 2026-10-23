"use client";
import { LocalizedTime } from "@/components/explorer/localized-time";
import { ServiceErrorText } from "@/components/query/service-error-text";

import { useTranslations } from "next-intl";

import { Alert, Button, Stack, Typography } from '@mui/material';
import { useNowTick } from '@/hooks/use-now-tick';
import type { QueryResult } from '@/lib/query-result';

export type QueryStatusProps = { result: QueryResult<unknown>; busy?: boolean; refresh?: () => void };

export function QueryStatus({ result, busy, refresh, compactLabel, showDetails = true }: QueryStatusProps & { compactLabel?: string; showDetails?: boolean }) {
  const t = useTranslations("query");
  const labels = { idle: t("not_queried"), loading: t("loading"), success: t("query_complete"), empty: t("query_complete_empty_result"), 'not-found': t("confirmed_not_found"), partial: t("partial_query_failure"), stale: t("refresh_failed_last_retrieved_data"), error: t("query_failed"), unsupported: t("unsupported"), cancelled: t("query_cancelled") };
  const status = <Typography variant="body2" role="status" aria-label={compactLabel ? t("query_status", { value0: compactLabel }) : t("query_status_2")}>{result.status === "idle" && busy ? t("loading") : labels[result.status]}</Typography>;
  const retry = <QueryRetry result={result} busy={busy} refresh={refresh} label={compactLabel} inline />;
  return <Stack spacing={1} data-query-status={result.status} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    {compactLabel ? <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
      <Typography variant="body2" fontWeight={700}>{compactLabel}</Typography>
      {status}
      {retry}
    </Stack> : status}
    {result.error && <Alert aria-label={t("query_error")} severity={result.status === 'partial' || result.status === 'stale' ? 'warning' : 'error'}>
      {<ServiceErrorText error={result.error} />} ({result.error.kind})
      {result.error.causes && result.error.causes.length > 1 && t("requests_failed", { value0: result.error.causes.length, value1: result.error.causes.map(error => error.status ? `HTTP ${error.status}` : error.kind).join(", ") })}
      {result.error.kind === "http" && result.error.status === 404 && t("http404Hint")}
    </Alert>}
    {compactLabel && showDetails ? <Typography variant="caption" color="text.secondary">
       {t("chain_2")} {result.context.chain}  {t("target")} {result.context.target}<br />
       {t("data_observed_at")} {result.observedAt ? <LocalizedTime value={result.observedAt} /> : t("no_data_observed_yet")}{result.blockHeight ? t("height_2", { value0: result.blockHeight }) : ''}
    </Typography> : !compactLabel && result.observedAt && <Typography variant="caption">{t("queried_at")} {<LocalizedTime value={result.observedAt} />} · {result.context.chain} · {result.context.target}{result.blockHeight ? t("height_2", { value0: result.blockHeight }) : ''}</Typography>}
    {compactLabel && showDetails && result.observations?.map((item, index) => <Typography key={index} variant="caption" color="text.secondary">
       {t("source")} {item.endpoint}  {t("observed")} {<LocalizedTime value={item.observedAt} />}  {t("response_height")} {item.blockHeight ?? t("unknown")}
    </Typography>)}
    {compactLabel && showDetails && result.error?.endpoint && <Typography variant="caption">
       {t("failed_source")} {result.error.endpoint}
    </Typography>}
    {compactLabel && showDetails && result.error?.causes?.map((cause, index) => <Typography key={index} variant="caption">
       {t("failure")} {index + 1}: {<ServiceErrorText error={cause} />} ({cause.kind}){cause.status ? ` · HTTP ${cause.status}` : ''}{cause.endpoint ? t("source_2", { value0: cause.endpoint }) : ''}
    </Typography>)}
    {!compactLabel && retry}
  </Stack>;
}

/** Shares Retry-After and busy behavior between compact shortcuts and expanded rows. */
export function QueryRetry({ result, busy, refresh, label, inline }: QueryStatusProps & { label?: string; inline?: boolean }) {
  const t = useTranslations("query");
  const now = useNowTick(1000);
  const wait = Math.max(0, Math.ceil(((result.error?.retryAt ?? 0) - now) / 1000));
  if (!refresh) return null;
  return <Button size="small" onClick={refresh} disabled={busy || wait > 0} aria-label={label ? t("retry", { value0: label }) : undefined}>
    {label && !inline && <>{label} · </>}{wait > 0 ? t("retry_in_seconds", { value0: wait }) : t("retry_query")}
  </Button>;
}
