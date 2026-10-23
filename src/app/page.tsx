"use client";
import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";


import { LocaleSelector } from "@/components/layout/locale-selector";
import Link from "@/components/layout/chain-link";
import { Alert, Button, Container, Stack, Typography } from "@mui/material";
import { getConfiguredChains } from "@/lib/env";

export default function Home() {
  const t = useTranslations("explorer");
  const st = useServiceText();
  let chainNames: string[] = [];
  let configError: string | null = null;
  try { chainNames = getConfiguredChains().map(chain => chain.name); }
  catch (error) { configError = error instanceof Error ? error.message : t("could_not_read_chain_configuration"); }
  return (
    <Container sx={{ py: { xs: 4, md: 8 }, overflowWrap: "anywhere" }}>
      <Stack spacing={4}>
        <LocaleSelector />
        <Stack spacing={2}>
          <Typography component="h1" variant="h3" fontWeight={800}>{t("gurufin_explorer")}</Typography>
          <Typography variant="h6" color="text.secondary">
             {t("explore_blocks_and_transactions_network_activity_and_validators")} </Typography>
          <Typography>{t("you_do_not_need_a_wallet_to_view_public")}</Typography>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button component={Link} href="/dashboard" variant="contained" size="large">{t("open_dashboard")}</Button>
          <Button component={Link} href="/blocks" variant="outlined" size="large">{t("explore_blocks")}</Button>
        </Stack>
        <Stack spacing={2}>
          <Typography component="h2" variant="h5" fontWeight={700}>{t("start_exploring")}</Typography>
          <Typography>{t("check_network_activity_on_the_dashboard_or_select_a")}</Typography>
          <Typography>{t("view_validators_and_their_details_under_staking_proposals_under")}</Typography>
          <Typography>{t("on_small_screens_open_the_navigation_menu_to_choose")}</Typography>
        </Stack>
        <Stack spacing={2}>
          <Typography component="h2" variant="h5" fontWeight={700}>{t("available_chains_and_scope")}</Typography>
          {configError ? <Alert severity="error">{st(configError)}</Alert> : <Typography>{t("configured_chains")} {chainNames.join(", ")}</Typography>}
          <Typography>{t("available_information_depends_on_each_chain_s_public_responses")}</Typography>
          <Alert severity="info">{t("wallet_transactions_are_available_only_for_verified_chain_and")}</Alert>
        </Stack>
      </Stack>
    </Container>
  );
}
