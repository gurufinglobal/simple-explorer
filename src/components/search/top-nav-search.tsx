"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { classifyQuery, searchHref, type SearchResolution, type ResolvedType } from "@/services/search/query-classifier";
import { getActiveChainConfig } from "@/lib/chain-selection";

const labels: Record<ResolvedType, string> = {
  txHash: "Cosmos tx hash (hex)", blockHeight: "블록 높이 (정수)", address: "계정 주소 (Bech32)", validator: "validator", token: "token",
};
export function TopNavSearch() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const feedbackId = useId();
  const [query, setQuery] = useState("");
  const [choice, setChoice] = useState<{ resolution: SearchResolution; chainKey: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  function navigate(resolution: SearchResolution, candidate: ResolvedType, expectedChain: string) {
    const chain = getActiveChainConfig();
    if (chain.key !== expectedChain) { setChoice(null); setError("체인이 변경되었습니다. 다시 검색하세요."); return; }
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
        <TextField inputRef={input} slotProps={{ htmlInput: { "aria-describedby": error || choice ? feedbackId : undefined } }} fullWidth size="small" label="블록 높이 / Cosmos tx hash (hex) / 계정 주소" value={query}
          onChange={event => { setQuery(event.target.value); setChoice(null); setError(null); }} />
        <Button type="submit" aria-label="search">검색</Button>
      </Stack>
    </form>
    {(error || choice) && <Paper id={feedbackId} elevation={8} sx={{ position: "absolute", top: "100%", left: 0, right: 0, mt: 1, p: 1, zIndex: 1, overflowWrap: "anywhere", maxHeight: "60vh", overflowY: "auto" }}>
    {error && <Alert severity="warning" aria-label="검색 오류">{error}</Alert>}
    {choice && <Stack role="group" aria-label="검색 후보 선택">
      <Typography>여러 의미로 해석되는 입력입니다. 조회 대상을 선택하세요.</Typography>
      {choice.resolution.candidates.map(candidate => <Button key={candidate}
        onClick={() => navigate(choice.resolution, candidate, choice.chainKey)}>{labels[candidate]}</Button>)}
    </Stack>}
    <Typography variant="caption">Cosmos tx hash만 조회합니다. EVM hash 대응·블록 hash 검색·validator/token 검색은 미지원입니다.</Typography>
    <Button size="small" onClick={closeFeedback}>닫기</Button>
    </Paper>}
  </Stack>;
}
