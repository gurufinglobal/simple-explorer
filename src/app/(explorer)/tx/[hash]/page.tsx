"use client";
import { formatTimestamp } from "@/lib/relative-time";
import { useLocale, useTranslations } from "next-intl";


import { CopyPageLink, CopyValue } from "@/components/explorer/copy-value";
import Link from "@/components/layout/chain-link";
import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useParams } from "next/navigation";
import { normalizeCosmosTxHash } from "@/services/search/query-classifier";
import { Alert } from "@mui/material";
import {
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { getTxDetail } from "@/services/guru/tx-details.service";

export default function TxDetailPage() {
  const params = useParams<{ hash: string }>();
  let hash: string;
  try { hash = normalizeCosmosTxHash(params.hash ?? ""); }
  catch (error) { return <Alert severity="error">{(error as Error).message}</Alert>; }
  return <TxDetailContent hash={hash} />;
}
function TxDetailContent({ hash }: { hash: string }) {
  const t = useTranslations("explorer");
  const locale = useLocale();
  const query = useQuery(`transaction:${hash}`, client => getTxDetail(hash, client));
  const tx = query.result.data;
  if (!tx) return <QueryStatus {...query} />;

  const gasUsedNumber = Number(tx.gasUsed);
  const gasWantedNumber = Number(tx.gasWanted);
  const gasRatio =
    Number.isFinite(gasUsedNumber) && Number.isFinite(gasWantedNumber) && gasWantedNumber > 0
      ? `${((gasUsedNumber / gasWantedNumber) * 100).toFixed(2)}%`
      : "-";

  const timestampLabel = tx.timestamp ? formatTimestamp(tx.timestamp, locale) : "-";
  const statusLabel = tx.code === 0 ? t("success") : t("failed");
  const statusColor = tx.code === 0 ? "success" : "error";
  const feeLabel = tx.feeAmount.length > 0 ? tx.feeAmount.map((coin) => `${coin.amount} ${coin.denom}`).join(", ") : "-";

  return (
    <Stack spacing={2}>
      <CopyPageLink />
      {tx.messages.some(message => message.shortType === "MsgEthereumTx") && <Alert severity="info">{t("cosmos_transaction_summary_evm_transaction_hash_mapping_receipts_logs")}</Alert>}
      <QueryStatus {...query} />
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }}>
        <Typography variant="h5" fontWeight={700}>
           {t("transaction_details")} </Typography>
        <Chip size="small" label={statusLabel} color={statusColor} />
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.25}>
            <Typography variant="subtitle2" color="text.secondary">
               {t("summary")} </Typography>
            <Typography sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
              <strong>{t("cosmos_tx_hash_hex")}</strong> {tx.hash}
            </Typography>
            <CopyValue label={t("copy_cosmos_transaction_hash_hex")} value={tx.hash} />
            <Typography>
              <strong>{t("height")}</strong>{" "}
              {tx.height !== "0" ? (
                <Link href={`/blocks/${tx.height}`} style={{ color: "inherit" }}>
                  {tx.height}
                </Link>
              ) : (
                "-"
              )}
            </Typography>
            <Typography>
              <strong>{t("timestamp")}</strong> {timestampLabel}
            </Typography>
            <Typography>
              <strong>{t("code")}</strong> {tx.code}
              {tx.codespace ? ` (${tx.codespace})` : ""}
            </Typography>
            <Typography>
              <strong>{t("messages")}</strong> {tx.messages.length}
            </Typography>
            <Typography>
              <strong>{t("memo")}</strong> {tx.memo || "-"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.25}>
            <Typography variant="subtitle2" color="text.secondary">
               {t("execution_information")} </Typography>
            <Typography>
              <strong>{t("gas_used")}</strong> {tx.gasUsed}
            </Typography>
            <Typography>
              <strong>{t("gas_wanted")}</strong> {tx.gasWanted}
            </Typography>
            <Typography>
              <strong>{t("gas_utilization")}</strong> {gasRatio}
            </Typography>
            <Typography>
              <strong>{t("fee")}</strong> {feeLabel}
            </Typography>
            <Typography>
              <strong>{t("fee_payer")}</strong> {tx.feePayer || "-"}
            </Typography>
            <Typography>
              <strong>{t("fee_granter")}</strong> {tx.feeGranter || "-"}
            </Typography>
            <Typography>
              <strong>{t("timeout_height")}</strong> {tx.timeoutHeight}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
             {t("message_types")} </Typography>
          {tx.messages.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
               {t("no_message_information_available")} </Typography>
          ) : (
            <List dense disablePadding>
              {tx.messages.map((message, index) => (
                <ListItem key={`${message.typeUrl}-${index}`} disablePadding sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={message.shortType}
                    secondary={
                      <Typography variant="caption" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                        {message.typeUrl}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
             {t("related_addresses")} </Typography>
          {tx.participantAddresses.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
               {t("could_not_extract_address_information")} </Typography>
          ) : (
            <Stack spacing={0.75}>
              {tx.participantAddresses.map((address) => (
                <Typography key={address} variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                  <Link href={`/address/${address}`} style={{ color: "inherit" }}>
                    {address}
                  </Link>
                </Typography>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
             {t("raw_log")} </Typography>
          <Divider sx={{ mb: 1 }} />
          <Typography
            component="pre"
            variant="caption"
            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace", m: 0 }}
          >
            {tx.rawLog || "-"}
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
