"use client";
import { Stack, Typography } from "@mui/material";
import { lcdBytesToHex } from "@/lib/bytes";
import { CopyValue } from "./copy-value";

export function EncodedBytes({ label, base64 }: { label: string; base64: string }) {
  const hex = lcdBytesToHex(base64);
  return <Stack spacing={0.5} sx={{ overflowWrap: "anywhere" }}>
    <Typography sx={{ fontFamily: "monospace" }}>{hex ?? "bytes 미확인"}</Typography>
    {hex && <CopyValue label={`${label} hex 복사`} value={hex} />}
    <Typography variant="caption">LCD base64 원문: {base64}</Typography>
    {base64 !== "-" && <CopyValue label={`${label} base64 원문 복사`} value={base64} />}
  </Stack>;
}
