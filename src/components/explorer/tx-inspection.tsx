"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { CopyValue } from "./copy-value";
import { txRecord, type TxInspection } from "@/services/guru/tx-details.service";

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? "—";
const valueText = (value: unknown) => typeof value === "string" ? value : json(value);
const wrap = { minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" } as const;

/** Mount expensive JSON/event trees only when opened. Native summary supports Enter/Space. */
function Fold({ title, children }: { title: string; children: () => ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Box component="details" onToggle={event => setOpen(event.currentTarget.open)} sx={{ ...wrap, border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
    <Box component="summary" sx={{ cursor: "pointer", fontWeight: 600, py: 0.5 }}>{title}</Box>
    {open && <Stack spacing={1.5} sx={{ mt: 1.5, ...wrap }}>{children()}</Stack>}
  </Box>;
}

function Raw({ value, label }: { value: unknown; label: string }) {
  const t = useTranslations("explorer.tx_inspection");
  if (value === undefined) return <CollectionState value={value} />;
  return <>
    <CopyValue label={t("copy_json", { label })} value={() => json(value)} />
    <Typography component="pre" variant="body2" sx={{ m: 0, whiteSpace: "pre-wrap", fontFamily: "monospace", ...wrap }}>{json(value)}</Typography>
  </>;
}

function Paged({ items, children }: { items: unknown[]; children: (item: unknown, index: number) => ReactNode }) {
  const t = useTranslations("explorer.tx_inspection");
  const [page, setPage] = useState(0);
  const last = Math.max(0, Math.ceil(items.length / 20) - 1);
  const current = Math.min(page, last);
  return <>
    {items.length > 20 && <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" role="group" aria-label={t("pagination")}>
      <Button disabled={current === 0} onClick={() => setPage(current - 1)}>{t("previous")}</Button>
      <Typography role="status" variant="caption">{t("page", { page: current + 1, total: last + 1, count: items.length })}</Typography>
      <Button disabled={current === last} onClick={() => setPage(current + 1)}>{t("next")}</Button>
    </Stack>}
    {items.slice(current * 20, current * 20 + 20).map((item, index) => <Box key={current * 20 + index} sx={wrap}>{children(item, current * 20 + index)}</Box>)}
  </>;
}

function CollectionState({ value }: { value: unknown }) {
  const t = useTranslations("explorer.tx_inspection");
  return <Typography color="text.secondary">{t(value === undefined ? "missing" : Array.isArray(value) ? "empty" : "invalid")}</Typography>;
}

type Field = "from_address" | "to_address" | "amount" | "delegator_address" | "validator_address" | "validator_src_address" | "validator_dst_address" | "sender" | "receiver" | "recipient" | "token" | "source_port" | "source_channel" | "action" | "module";
const messageFields: Record<string, Field[]> = {
  "/cosmos.bank.v1beta1.MsgSend": ["from_address", "to_address", "amount"],
  "/cosmos.staking.v1beta1.MsgDelegate": ["delegator_address", "validator_address", "amount"],
  "/cosmos.staking.v1beta1.MsgUndelegate": ["delegator_address", "validator_address", "amount"],
  "/cosmos.staking.v1beta1.MsgBeginRedelegate": ["delegator_address", "validator_src_address", "validator_dst_address", "amount"],
  "/ibc.applications.transfer.v1.MsgTransfer": ["sender", "receiver", "token", "source_port", "source_channel"],
};

function Messages({ value }: { value: unknown }) {
  const t = useTranslations("explorer.tx_inspection");
  if (!Array.isArray(value) || !value.length) return <CollectionState value={value} />;
  return <Paged items={value}>{(item, index) => {
    const record = txRecord(item);
    const type = record?.["@type"] ?? record?.type_url;
    const typeUrl = typeof type === "string" ? type : t("unknown_type");
    return <Fold title={`#${index + 1} ${typeUrl}`}>{() => <>
      {(messageFields[typeUrl] ?? []).filter(key => record && key in record).map(key => <Typography key={key} component="div" variant="body2"><strong>{t(`fields.${key}`)}</strong>: {valueText(record![key])}</Typography>)}
      <Raw label={t("message", { index: index + 1 })} value={item} />
    </>}</Fold>;
  }}</Paged>;
}

function Events({ value, source }: { value: unknown; source: string }) {
  const t = useTranslations("explorer.tx_inspection");
  const [raw, setRaw] = useState(false);
  const rows = Array.isArray(value) ? value : [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const type = txRecord(row)?.type;
    const name = typeof type === "string" ? type : t("unknown_type");
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return <>
    <Typography variant="subtitle2">{source}</Typography>
    <Stack direction="row" spacing={1} role="group" aria-label={t("view", { source })}>
      <Button aria-pressed={!raw} onClick={() => setRaw(false)}>{t("analysis")}</Button>
      <Button aria-pressed={raw} onClick={() => setRaw(true)}>Raw JSON</Button>
    </Stack>
    {raw ? <Raw label={source} value={value} /> : !rows.length ? <CollectionState value={value} /> : <>
      <Typography>{t("event_count", { count: rows.length })}</Typography>
      <Fold title={t("type_counts")}>{() => <Paged items={[...counts]}>{entry => {
        const [type, count] = entry as [string, number];
        return <Typography variant="body2">{type}: {count}</Typography>;
      }}</Paged>}</Fold>
      <Paged items={rows}>{(item, index) => {
        const event = txRecord(item);
        const type = typeof event?.type === "string" ? event.type : t("unknown_type");
        const attributes = event?.attributes;
        const known: Field[] = type === "transfer" ? ["sender", "recipient", "amount"] : type === "message" ? ["action", "sender", "module"] : [];
        return <Box sx={{ ...wrap, borderTop: 1, borderColor: "divider", pt: 1 }}>
          <Typography fontWeight={600}>#{index + 1} {type}</Typography>
          {known.length > 0 && <Typography variant="caption" color="text.secondary">{t(type === "transfer" ? "transfer_hint" : "message_hint")}</Typography>}
          {!Array.isArray(attributes) || !attributes.length ? <CollectionState value={attributes} /> : <Stack spacing={0.5}>
            <Paged items={attributes}>{(attribute, attrIndex) => {
              const attr = txRecord(attribute);
              return <Typography component="div" variant="body2" sx={{ fontFamily: "monospace", ...wrap }}>
                {attrIndex + 1}. {typeof attr?.key === "string" && known.includes(attr.key as Field) ? <strong>{t(`fields.${attr.key as Field}`)} ({attr.key})</strong> : valueText(attr?.key)}: {valueText(attr?.value)}
              </Typography>;
            }}</Paged>
          </Stack>}
          <Fold title={t("event_raw", { index: index + 1 })}>{() => <Raw label={`${source} #${index + 1}`} value={item} />}</Fold>
        </Box>;
      }}</Paged>
    </>}
  </>;
}

function Logs({ value }: { value: unknown }) {
  const t = useTranslations("explorer.tx_inspection");
  if (!Array.isArray(value) || !value.length) return <CollectionState value={value} />;
  return <Paged items={value}>{(item, index) => {
    const log = txRecord(item);
    const label = t("log_source", { index: index + 1, message: valueText(log?.msg_index) });
    return <Fold title={label}>{() => <>
      <Events value={log?.events} source={label} />
      <Fold title={t("log_raw")}>{() => <Raw label={label} value={item} />}</Fold>
    </>}</Fold>;
  }}</Paged>;
}

export function TxInspectionPanels({ tx }: { tx: TxInspection }) {
  const t = useTranslations("explorer.tx_inspection");
  const rawLog = txRecord(tx.raw.tx_response)?.raw_log;
  let logState: "missing" | "empty_log" | "invalid_log" | "json_log" = rawLog === undefined ? "missing" : rawLog === "" ? "empty_log" : "invalid_log";
  if (typeof rawLog === "string" && rawLog) {
    try { JSON.parse(rawLog); logState = "json_log"; } catch { /* Keep the original non-JSON log. */ }
  }
  return <Stack spacing={2} sx={wrap}>
    <Fold title={t("messages")} >{() => <>
      <Typography variant="body2">{t(`source_${tx.txSource}`)}</Typography>
      <Messages value={tx.messageBodies} />
      <Fold title={t("body_extra")}>{() => <Raw label={t("body_extra")} value={tx.selectedTx?.body} />}</Fold>
    </>}</Fold>
    <Fold title={t("auth")} >{() => <>
      <Alert severity="info">{t("signer_notice")}</Alert>
      <Raw label="auth_info" value={tx.selectedTx?.auth_info} />
      <Fold title="signatures">{() => <Raw label="signatures" value={tx.selectedTx?.signatures} />}</Fold>
    </>}</Fold>
    <Fold title={t("events")} >{() => <>
      <Alert severity="info">{t("event_notice")}</Alert>
      <Events source="tx_response.events" value={tx.events} />
      <Fold title={t("logs")} >{() => <Logs value={tx.logs} />}</Fold>
    </>}</Fold>
    <Fold title={t("raw_log")} >{() => <>
      <Typography variant="body2">{t(logState)}</Typography>
      <Raw label="raw_log" value={rawLog} />
    </>}</Fold>
    <Fold title={t("full_raw")} >{() => <>
      <Typography variant="body2">{t("raw_notice")}</Typography>
      <Raw label={t("full_raw")} value={tx.raw} />
    </>}</Fold>
  </Stack>;
}
