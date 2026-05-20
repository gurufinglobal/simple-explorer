"use client";

import { useEffect, useMemo, useState } from "react";
import { FormControl, InputLabel, MenuItem, Select, Stack, Typography } from "@mui/material";
import { setActiveChainKeyCookie, getActiveChainKeyFromClientCookie } from "@/lib/chain-selection";
import { getChainByKey, getConfiguredChains, getDefaultChainKey } from "@/lib/env";

export function ChainSelector() {
  const chains = useMemo(() => getConfiguredChains(), []);
  const defaultKey = useMemo(() => getDefaultChainKey(), []);
  const [value, setValue] = useState(defaultKey);

  useEffect(() => {
    const fromCookie = getActiveChainKeyFromClientCookie();
    const resolved = getChainByKey(fromCookie)?.key ?? defaultKey;
    setValue(resolved);
    setActiveChainKeyCookie(resolved);
  }, [defaultKey]);

  if (chains.length <= 1) {
    return null;
  }

  return (
    <Stack spacing={0.75} sx={{ px: 0, pt: 2 }}>
      <FormControl size="small" fullWidth>
        <InputLabel id="chain-select-label">Select Chain</InputLabel>
        <Select
          labelId="chain-select-label"
          label="Select Chain"
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            if (next === value) {
              return;
            }
            setValue(next);
            setActiveChainKeyCookie(next);
            window.location.reload();
          }}
        >
          {chains.map((chain) => (
            <MenuItem key={chain.key} value={chain.key}>
              {chain.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  );
}
