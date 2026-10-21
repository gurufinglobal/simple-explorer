"use client";
import { useState } from "react";
import { Button, Typography } from "@mui/material";
import { withChain } from "@/lib/chain-selection";

export function CopyValue({ label, value }: { label: string; value: string | (() => string) }) {
  const [status, setStatus] = useState("");
  return <>
    <Button size="small" onClick={async () => {
      try { await navigator.clipboard.writeText(typeof value === "function" ? value() : value); setStatus("복사했습니다."); }
      catch { setStatus("복사하지 못했습니다. 값을 직접 복사하세요."); }
    }}>{label}</Button>
    {status && <Typography role="status" variant="caption">{status}</Typography>}
  </>;
}
export function CopyPageLink() {
  return <CopyValue label="체인 포함 링크 복사" value={() => new URL(withChain(window.location.pathname + window.location.search + window.location.hash), window.location.origin).href} />;
}
