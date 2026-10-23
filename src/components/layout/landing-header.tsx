"use client";

import { Box, Button, Container, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import Link from './chain-link';
import { LocaleSelector } from './locale-selector';

export function LandingHeader() {
  const t = useTranslations('navigation');
  return <Box component="header" sx={{ borderBottom: 1, borderColor: 'divider' }}>
    <Container sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', md: 'auto 1fr auto' }, alignItems: 'center', columnGap: { xs: 2, md: 5 }, rowGap: 1, py: 2 }}>
      <Typography component={Link} href="/" variant="h6" fontWeight={800} sx={{ color: 'text.primary', textDecoration: 'none', width: 'fit-content' }}>
        Gurufin Explorer
      </Typography>
      <Box component="nav" aria-label={t('navigation')} sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 0.5, sm: 1 }, gridRow: { xs: 2, md: 1 }, gridColumn: { xs: '1 / -1', md: 2 } }}>
        {(['dashboard', 'blocks', 'transactions'] as const).map(route => <Button key={route} component={Link} href={`/${route}`} color="inherit" sx={{ minHeight: 44, px: 1, textTransform: 'none' }}>{t(route)}</Button>)}
      </Box>
      <Box sx={{ gridColumn: { xs: 2, md: 3 }, gridRow: 1, justifySelf: 'end' }}><LocaleSelector variant="menu" /></Box>
    </Container>
  </Box>;
}
