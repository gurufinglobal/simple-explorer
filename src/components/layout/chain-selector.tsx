"use client";
import { useEffect, useId, useState } from "react";
import { Alert, FormControl, InputLabel, MenuItem, Select, Stack } from "@mui/material";
import { selectActiveChain, getActiveChainConfig } from "@/lib/chain-selection";
import { getConfiguredChains, type ChainConfig } from "@/lib/env";
export function ChainSelector() {
  const labelId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  let chains: ChainConfig[] = [];
  let configError: string | null = null;
  try { chains = getConfiguredChains(); } catch (e) { configError = e instanceof Error ? e.message : "체인 설정 오류"; }
  useEffect(() => {
    const sync = () => {
      try { setValue(getActiveChainConfig().key); setError(null); }
      catch (e) { setValue(""); setError(e instanceof Error ? e.message : "체인 설정 오류"); }
    };
    sync();
    window.addEventListener("explorer:chain-changed", sync);
    return () => window.removeEventListener("explorer:chain-changed", sync);
  }, []);
  return <Stack spacing={1} sx={{ pt: 2 }}>
    {(configError ?? error) && <Alert severity="error">{configError ?? error}</Alert>}
    <FormControl size="small" fullWidth disabled={!chains.length}>
      <InputLabel id={labelId}>Select Chain</InputLabel>
      <Select labelId={labelId} label="Select Chain" value={chains.some(c => c.key === value) ? value : ""}
        onChange={event => { selectActiveChain(event.target.value); setValue(event.target.value); setError(null); }}>
        {chains.map(chain => <MenuItem key={chain.key} value={chain.key}>{chain.name}</MenuItem>)}
      </Select>
    </FormControl>
  </Stack>;
}
