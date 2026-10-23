'use client';
import { useId, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Alert, FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material';
import { setLocale } from '@/i18n/actions';

export function LocaleSelector() {
  const locale = useLocale();
  const t = useTranslations('common');
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return <Stack spacing={1} sx={{ minWidth: 110 }}>
    <FormControl size="small" disabled={pending}>
      <InputLabel id={id}>{t('language')}</InputLabel>
      <Select labelId={id} label={t('language')} value={locale} onChange={event => {
        const next = event.target.value;
        setFailed(false);
        startTransition(async () => {
          try { await setLocale(next); router.refresh(); }
          catch { setFailed(true); }
        });
      }}>
        <MenuItem value="en" lang="en">English</MenuItem>
        <MenuItem value="ko" lang="ko">한국어</MenuItem>
      </Select>
    </FormControl>
    {failed && <Alert severity="error">{t('languageChangeFailed')}</Alert>}
  </Stack>;
}
