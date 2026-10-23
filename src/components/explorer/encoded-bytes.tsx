"use client";
import { useTranslations } from "next-intl";

import { Stack, Typography } from "@mui/material";
import { lcdBytesToHex } from "@/lib/bytes";
import { CopyValue } from "./copy-value";

export function EncodedBytes({ label, base64 }: { label: string; base64: string }) {
  const t = useTranslations("explorer");
  const hex = lcdBytesToHex(base64);
  return <Stack spacing={0.5} sx={{ overflowWrap: "anywhere" }}>
    <Typography sx={{ fontFamily: "monospace" }}>{hex ?? t("bytes_unknown")}</Typography>
    {hex && <CopyValue label={t("copy_hex", { value0: label })} value={hex} />}
    <Typography variant="caption">{t("original_lcd_base64")} {base64}</Typography>
    {base64 !== "-" && <CopyValue label={t("copy_original_base64", { value0: label })} value={base64} />}
  </Stack>;
}
