"use client";
import { useState } from "react";
import { Alert, Checkbox, FormControlLabel } from "@mui/material";
import { QueryStatus } from "@/components/query/query-status";
import { useQuery } from "@/hooks/use-query";
import { getDenomsMetadata } from "@/services/guru/token-metadata.service";
import { displayToBase } from "@/lib/cosmos-amount";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { getActiveChainConfig } from "@/lib/chain-selection";

/** The same base string shown for confirmation is passed to the existing tx client. */
export function useAmountEntry(value: string, denom: string) {
  const query = useQuery("amount-metadata", client => getDenomsMetadata(client));
  const generation = useWalletSessionStore(s => s.generation);
  const metadata = query.result.status === "success" ? query.result.data?.find(m => m.baseDenom === denom) : undefined;
  let base: string | null = null;
  let error: string | null = null;
  try { base = displayToBase(value, metadata?.decimals); } catch (e) { error = (e as Error).message; }
  const key = JSON.stringify([getActiveChainConfig().key, generation, value, denom, base]);
  const [approval, setApproval] = useState({ key, confirmed: false });
  if (approval.key !== key) setApproval({ key, confirmed: false });
  const ready = base !== null && approval.key === key && approval.confirmed;
  const requireBase = () => {
    const nowKey = JSON.stringify([getActiveChainConfig().key, useWalletSessionStore.getState().generation, value, denom, base]);
    if (!ready || nowKey !== approval.key || base === null) throw new Error("수량·체인·계정을 다시 확인하세요.");
    return base;
  };
  return { base, ready, requireBase, unit: metadata?.symbol ?? denom, confirmation: <>
    <QueryStatus {...query} />
    <Alert severity={base === null ? "info" : "success"}>
      {base === null ? error : `표시 수량 ${value} ${metadata?.symbol || metadata?.displayDenom} → 전송 원본 ${base} ${denom}`}
    </Alert>
    <FormControlLabel label="표시 수량과 전송 원본을 확인했습니다" control={<Checkbox checked={ready} disabled={base === null} onChange={event => setApproval({ key, confirmed: event.target.checked })} />} />
  </> };
}
