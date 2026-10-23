"use client";
import { useTranslations } from "next-intl";


import Link from "@/components/layout/chain-link";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import type { BlockDetail } from "@/services/guru/block-details.service";

import { EncodedBytes } from "./encoded-bytes";
import { CopyPageLink } from "./copy-value";

function mono(value: string) {
  return (
    <Typography component="span" variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
      {value}
    </Typography>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.5, sm: 2 }}
      sx={{ py: 0.75, alignItems: { sm: "flex-start" } }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: { sm: 200 }, flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Stack sx={{ flex: 1, minWidth: 0 }}>{children}</Stack>
    </Stack>
  );
}

function previousBlockHeight(block: BlockDetail): string | null {
  const lc = block.lastCommitHeight;
  if (lc && lc !== "-" && /^\d+$/.test(lc)) {
    return lc;
  }
  try {
    const n = BigInt(block.height);
    const one = BigInt(1);
    if (n <= one) {
      return null;
    }
    return String(n - one);
  } catch {
    return null;
  }
}

type Props = {
  block: BlockDetail;
};

export function BlockDetailView({ block }: Props) {
  const t = useTranslations("explorer");
  const prevH = previousBlockHeight(block);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
         {t("block_details")} </Typography>

      <CopyPageLink />
      <Typography variant="caption">{t("block_hashes_and_header_bytes_are_shown_in_hex")}</Typography>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
             {t("summary")} </Typography>
          <DetailRow label={t("height_2")}>{mono(block.height)}</DetailRow>
          <DetailRow label={t("chain_id")}>{mono(block.chainId)}</DetailRow>
          <DetailRow label={t("block_time")}>{mono(block.time)}</DetailRow>
          <DetailRow label={t("block_id_hash_hex")}><EncodedBytes label={t("block_id_hash")} base64={block.hash} /></DetailRow>
          <DetailRow label={t("proposer_consensus_bytes_hex")}><EncodedBytes label={t("proposer_consensus_bytes")} base64={block.proposer} /><Typography variant="caption">{t("not_converted_to_account_or_valoper_addresses")}</Typography></DetailRow>
          <DetailRow label={t("transaction_count")}>
            <Typography variant="body2">{block.txCount}</Typography>
          </DetailRow>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
             {t("protocol_version")} </Typography>
          <DetailRow label={t("block_version")}>
            <Typography variant="body2">{block.blockVersion}</Typography>
          </DetailRow>
          <DetailRow label={t("app_version")}>
            <Typography variant="body2">{block.appVersion}</Typography>
          </DetailRow>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
             {t("previous_block_and_commit")} </Typography>
          <DetailRow label={t("previous_block_hash")}><EncodedBytes label="lastBlockHash" base64={block.lastBlockHash} /></DetailRow>
          {prevH ? (
            <DetailRow label={t("go_to_previous_block")}>
              <Link href={`/blocks/${prevH}`} style={{ textDecoration: "none" }}>
                <Typography color="primary" variant="body2">
                   {t("height_2")} {prevH}  {t("view")} </Typography>
              </Link>
            </DetailRow>
          ) : null}
          <Divider sx={{ my: 1 }} />
          <DetailRow label={t("last_commit_hash")}><EncodedBytes label="lastCommitHash" base64={block.lastCommitHash} /></DetailRow>
          <DetailRow label={t("last_commit_height")}>{mono(block.lastCommitHeight)}</DetailRow>
          <DetailRow label={t("last_commit_round")}>
            <Typography variant="body2">{block.lastCommitRound}</Typography>
          </DetailRow>
          <DetailRow label={t("commit_signature_count")}>
            <Typography variant="body2">{block.commitSignaturesCount}</Typography>
          </DetailRow>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
             {t("merkle_roots_header")} </Typography>
          <DetailRow label={t("data")}><EncodedBytes label="dataHash" base64={block.dataHash} /></DetailRow>
          <DetailRow label={t("validator_set")}><EncodedBytes label="validatorsHash" base64={block.validatorsHash} /></DetailRow>
          <DetailRow label={t("next_validator_set")}><EncodedBytes label="nextValidatorsHash" base64={block.nextValidatorsHash} /></DetailRow>
          <DetailRow label={t("consensus")}><EncodedBytes label="consensusHash" base64={block.consensusHash} /></DetailRow>
          <DetailRow label={t("app_state")}><EncodedBytes label="appHash" base64={block.appHash} /></DetailRow>
          <DetailRow label={t("previous_execution_results")}><EncodedBytes label="lastResultsHash" base64={block.lastResultsHash} /></DetailRow>
          <DetailRow label={t("evidence_root")}><EncodedBytes label="evidenceHash" base64={block.evidenceHash} /></DetailRow>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
             {t("evidence")} </Typography>
          <DetailRow label={t("evidence_count")}>
            <Typography variant="body2">{block.evidenceCount}</Typography>
          </DetailRow>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
             {t("transactions")} </Typography>
          {block.txs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
               {t("no_transactions_in_this_block")} </Typography>
          ) : (
            <List disablePadding dense>
              {block.txs.map((tx, index) => (
                <ListItem key={`${tx.hash}-${index}`} divider disablePadding sx={{ py: 1, display: "block" }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Typography variant="caption" color="text.secondary" sx={{ pt: 0.25, flexShrink: 0 }}>
                      #{index + 1}
                    </Typography>
                    <ListItemText
                      primary={
                        <Link href={`/tx/${tx.hash}`} style={{ textDecoration: "none", color: "inherit" }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: "monospace",
                              wordBreak: "break-all",
                              "&:hover": { textDecoration: "underline" },
                            }}
                          >
                            {tx.hash}
                          </Typography>
                        </Link>
                      }
                    />
                  </Stack>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
