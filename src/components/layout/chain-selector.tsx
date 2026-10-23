"use client";
import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { Alert, FormControl, InputLabel, MenuItem, Select, Stack } from "@mui/material";
import { selectActiveChain, getActiveChainConfig } from "@/lib/chain-selection";
import { getConfiguredChains, type ChainConfig } from "@/lib/env";
// Each drawer supplies its own stable ID, including when both are mounted.
export function ChainSelector({ id }: { id: string }) {
  const t = useTranslations("navigation");
  const st = useServiceText();
  const labelId = `${id}-label`;
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  let chains: ChainConfig[] = [];
  let configError: string | null = null;
  try { chains = getConfiguredChains(); } catch (e) { configError = e instanceof Error ? e.message : t("chain_configuration_error"); }
  useEffect(() => {
    const sync = () => {
      try { setValue(getActiveChainConfig().key); setError(null); }
      catch (e) { setValue(""); setError(e instanceof Error ? e.message : t("chain_configuration_error")); }
    };
    sync();
    window.addEventListener("explorer:chain-changed", sync);
    return () => window.removeEventListener("explorer:chain-changed", sync);
  }, [t]);
  return <Stack spacing={1} sx={{ pt: 2 }}>
    {(configError ?? error) && <Alert severity="error">{st(configError ?? error)}</Alert>}
    <FormControl size="small" fullWidth disabled={!chains.length}>
      <InputLabel id={labelId}>{t("select_chain")}</InputLabel>
      <Select id={id} labelId={labelId} label={t("select_chain")} value={chains.some(c => c.key === value) ? value : ""}
        onChange={event => { selectActiveChain(event.target.value); setValue(event.target.value); setError(null); }}>
        {chains.map(chain => <MenuItem key={chain.key} value={chain.key}>{chain.name}</MenuItem>)}
      </Select>
    </FormControl>
  </Stack>;
}
