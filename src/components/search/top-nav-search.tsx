"use client";
import { ServiceErrorText } from "@/components/query/service-error-text";

import { useTranslations } from "next-intl";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { classifyQuery, searchHref, type SearchResolution, type ResolvedType } from "@/services/search/query-classifier";
import { getActiveChainConfig } from "@/lib/chain-selection";


export function TopNavSearch() {
  const t = useTranslations("explorer");
const labels: Record<ResolvedType, string> = {
  txHash: "Cosmos tx hash (hex)", blockHeight: t("block_height_integer"), address: t("account_address_bech32"), validator: "validator", token: "token",
};

  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const feedbackId = useId();
  const [query, setQuery] = useState("");
  const [choice, setChoice] = useState<{ resolution: SearchResolution; chainKey: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  function navigate(resolution: SearchResolution, candidate: ResolvedType, expectedChain: string) {
    const chain = getActiveChainConfig();
    if (chain.key !== expectedChain) { setChoice(null); setError(t("the_chain_changed_search_again")); return; }
    router.push(searchHref(resolution, candidate, chain));
    setChoice(null);
  }
  function submit(event: FormEvent) {
    event.preventDefault(); setChoice(null); setError(null);
    try {
      const chain = getActiveChainConfig();
      const resolution = classifyQuery(query, chain);
      if (resolution.error || !resolution.resolvedType) { setError(resolution.error); return; }
      if (resolution.hasConflict) { setChoice({ resolution, chainKey: chain.key }); return; }
      navigate(resolution, resolution.resolvedType, chain.key);
    } catch (e) { setError((e as Error).message); }
  }
  function closeFeedback() { setError(null); setChoice(null); input.current?.focus(); }
  return <Stack sx={{ position: "relative", minWidth: 0 }} onKeyDown={event => {
    if (event.key === "Escape" && (error || choice)) { event.stopPropagation(); closeFeedback(); }
  }}>
    <form onSubmit={submit}>
      <Stack direction="row" spacing={1}>
        <TextField inputRef={input} slotProps={{ htmlInput: { "aria-describedby": error || choice ? feedbackId : undefined } }} fullWidth size="small" label={t("block_height_cosmos_tx_hash_hex_account_address")} value={query}
          onChange={event => { setQuery(event.target.value); setChoice(null); setError(null); }} />
        <Button type="submit" aria-label={t("search")}>{t("search_2")}</Button>
      </Stack>
    </form>
    {(error || choice) && <Paper id={feedbackId} elevation={8} sx={{ position: "absolute", top: "100%", left: 0, right: 0, mt: 1, p: 1, zIndex: 1, overflowWrap: "anywhere", maxHeight: "60vh", overflowY: "auto" }}>
    {error && <Alert severity="warning" aria-label={t("search_error")}>{<ServiceErrorText error={error} />}</Alert>}
    {choice && <Stack role="group" aria-label={t("select_search_candidate")}>
      <Typography>{t("this_input_has_multiple_interpretations_select_a_query_target")}</Typography>
      {choice.resolution.candidates.map(candidate => <Button key={candidate}
        onClick={() => navigate(choice.resolution, candidate, choice.chainKey)}>{labels[candidate]}</Button>)}
    </Stack>}
    <Typography variant="caption">{t("only_cosmos_transaction_hashes_are_queried_evm_hash_mapping")}</Typography>
    <Button size="small" onClick={closeFeedback}>{t("close")}</Button>
    </Paper>}
  </Stack>;
}
