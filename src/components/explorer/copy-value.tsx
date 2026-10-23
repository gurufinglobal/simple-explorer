"use client";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { Button, Typography } from "@mui/material";
import { withChain } from "@/lib/chain-selection";

export function CopyValue({ label, value }: { label: string; value: string | (() => string) }) {
  const t = useTranslations("explorer");
  const [status, setStatus] = useState("");
  return <>
    <Button size="small" onClick={async () => {
      try { await navigator.clipboard.writeText(typeof value === "function" ? value() : value); setStatus(t("copied")); }
      catch { setStatus(t("could_not_copy_copy_the_value_manually")); }
    }}>{label}</Button>
    {status && <Typography role="status" variant="caption">{status}</Typography>}
  </>;
}
export function CopyPageLink() {
  const t = useTranslations("explorer");
  return <CopyValue label={t("copy_link_including_chain")} value={() => new URL(withChain(window.location.pathname + window.location.search + window.location.hash), window.location.origin).href} />;
}
