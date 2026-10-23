"use client";
import { useTranslations } from "next-intl";

import { Alert, Chip, List, ListItem, ListItemButton, ListItemText, Stack, Typography } from '@mui/material';
import Link from '@/components/layout/chain-link';
import { useAddressTransactions } from '@/hooks/use-address-transactions';
import { QueryInfo } from '@/components/query/query-info';
import { PageControls } from '@/components/query/page-controls';

export function AddressTransactions({ address }: { address: string }) {
  const t = useTranslations("explorer");
  const query = useAddressTransactions(address);
  return <Stack spacing={1}>
    <Typography variant="subtitle2">{t("related_transactions")}</Typography>
    <Typography variant="body2">{t("indexed_sender_recipient_transactions_excluding_full_evm_internal_history")}</Typography>
    <QueryInfo label={t("sender_and_recipient_query_information")} queries={[{ ...query.sender, label: t("sent") }, { ...query.recipient, label: t("received") }]} />
    <Stack component="section" aria-label={t("sent_transactions")}><PageControls {...query.sender} label={t("sent")} /></Stack>
    <Stack component="section" aria-label={t("received_transactions")}><PageControls {...query.recipient} label={t("received")} /></Stack>
    {query.partial && <Alert severity="warning">{t("only_part_of_the_sender_recipient_range_was_retrieved")}</Alert>}
    {query.buffered > 0 && <Typography>{t("buffered_at_the_sorting_boundary")} {query.buffered}{t("records_load_more_sender_recipient_transactions_to_check_the")}</Typography>}
    {!query.loading && !query.partial && !query.rows.length && !query.buffered && <Typography>{t("no_transactions_in_the_queried_range")}</Typography>}
    <List dense disablePadding>{query.rows.map(tx => <ListItem key={tx.hash} disablePadding>
      <ListItemButton component={Link} href={`/tx/${tx.hash}`}>
        <ListItemText primary={tx.hash} secondary={t("transactionSummary", { height: tx.height, used: tx.gasUsed, wanted: tx.gasWanted })} />
        <Chip label={t(tx.code === 0 ? "transactionSuccess" : "transactionFailed")} color={tx.code === 0 ? 'success' : 'error'} size="small" />
      </ListItemButton>
    </ListItem>)}</List>
  </Stack>;
}
