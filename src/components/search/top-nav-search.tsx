"use client";

import { FormEvent, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import SearchIcon from "@mui/icons-material/Search";
import { Alert, IconButton, InputAdornment, Snackbar, TextField } from "@mui/material";
import { classifyQuery } from "@/services/search/query-classifier";

function resolveHrefFromQuery(query: string): { href: string | null; error: string | null } {
  const trimmed = query.trim();
  if (!trimmed) {
    return { href: null, error: "검색어를 입력해주세요." };
  }

  const resolved = classifyQuery(trimmed);
  if (resolved.resolvedType === "blockHeight") {
    return { href: `/blocks/${encodeURIComponent(trimmed)}`, error: null };
  }
  if (resolved.resolvedType === "txHash") {
    return { href: `/tx/${encodeURIComponent(trimmed)}`, error: null };
  }
  if (resolved.resolvedType === "address") {
    return { href: `/address/${encodeURIComponent(trimmed)}`, error: null };
  }
  return { href: null, error: "block height, tx hash, account address만 지원합니다." };
}

export function TopNavSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const placeholder = useMemo(
    () => "Block Height / Tx Hash / Account Address",
    [],
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const target = resolveHrefFromQuery(query);
    if (!target.href) {
      setError(target.error ?? "검색 대상을 판별할 수 없습니다.");
      return;
    }
    setError(null);
    if (pathname === target.href) {
      return;
    }
    router.push(target.href);
  }

  return (
    <>
      <form onSubmit={onSubmit} style={{ width: "100%" }}>
        <TextField
          fullWidth
          size="small"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton type="submit" size="small" aria-label="search">
                    <SearchIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      </form>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={2500}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="warning" onClose={() => setError(null)} variant="filled">
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
