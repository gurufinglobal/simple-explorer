'use client';
import { useId, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Alert, FormControl, IconButton, InputLabel, ListItemIcon, ListItemText, Menu, MenuItem, Select, Stack } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import CheckIcon from '@mui/icons-material/Check';
import { setLocale } from '@/i18n/actions';

export function LocaleSelector({ variant = 'select' }: { variant?: 'select' | 'menu' }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  function changeLocale(next: string) {
    setAnchor(null);
    if (pending || next === locale) return;
    setFailed(false);
    startTransition(async () => {
      try { await setLocale(next); router.refresh(); }
      catch { setFailed(true); }
    });
  }
  if (variant === 'menu') return <Stack sx={{ position: 'relative' }}>
    <IconButton
      id={`${id}-button`}
      aria-label={t('language')}
      aria-haspopup="menu"
      aria-expanded={Boolean(anchor)}
      aria-controls={anchor ? `${id}-menu` : undefined}
      aria-disabled={pending}
      aria-busy={pending}
      onClick={event => { if (!pending) setAnchor(event.currentTarget); }}
      sx={{ width: 44, height: 44, border: 1, borderColor: 'divider', color: 'text.primary', opacity: pending ? 0.5 : 1 }}
    ><LanguageIcon /></IconButton>
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={() => setAnchor(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ list: { id: `${id}-menu`, 'aria-labelledby': `${id}-button` }, paper: { sx: { mt: 1, minWidth: 180 } } }}
    >
      {([['en', 'English'], ['ko', '한국어']] as const).map(([value, label]) => <MenuItem
        key={value} lang={value} role="menuitemradio" aria-checked={locale === value}
        selected={locale === value} disabled={pending} onClick={() => changeLocale(value)} sx={{ minHeight: 48 }}
      >
        <ListItemIcon>{locale === value && <CheckIcon fontSize="small" />}</ListItemIcon>
        <ListItemText>{label}</ListItemText>
      </MenuItem>)}
    </Menu>
    {failed && <Alert severity="error" sx={{ position: 'absolute', top: 52, right: 0, width: 280, maxWidth: 'calc(100vw - 32px)', zIndex: 1 }}>{t('languageChangeFailed')}</Alert>}
  </Stack>;
  return <Stack spacing={1} sx={{ minWidth: 110 }}>
    <FormControl size="small" disabled={pending}>
      <InputLabel id={id}>{t('language')}</InputLabel>
      <Select labelId={id} label={t('language')} value={locale} onChange={event => changeLocale(event.target.value)}>
        <MenuItem value="en" lang="en">English</MenuItem>
        <MenuItem value="ko" lang="ko">한국어</MenuItem>
      </Select>
    </FormControl>
    {failed && <Alert severity="error">{t('languageChangeFailed')}</Alert>}
  </Stack>;
}
