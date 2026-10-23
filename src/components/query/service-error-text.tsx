'use client';
import { useTranslations } from 'next-intl';
import { describeServiceMessage } from '@/i18n/service-message';
import { useServiceText } from '@/i18n/use-service-text';

export function ServiceErrorText({ error, summary }: { error: unknown; summary?: string }) {
  const t = useTranslations('common');
  const st = useServiceText();
  const known = describeServiceMessage(error) ?? (error && typeof error === 'object' && 'message' in error ? describeServiceMessage(error.message) : null);
  if (known) return <>{st(known)}{error && typeof error === "object" && "detail" in error && typeof error.detail === "string" && <span data-original-error="true"> · {t("originalDetail")}: {error.detail}</span>}</>;
  const raw = typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (!raw) return null;
  return <>{summary ?? t('externalError')} <span data-original-error="true">{t('originalDetail')}: {raw}</span></>;
}
