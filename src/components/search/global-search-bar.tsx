"use client";
import { Card, CardContent, Stack, Typography } from "@mui/material";
import { TopNavSearch } from "./top-nav-search";

export function GlobalSearchBar() {
  return <Card variant="outlined"><CardContent><Stack spacing={2}>
    <Typography variant="h6">통합 검색</Typography>
    <TopNavSearch />
    <Typography variant="caption">Cosmos tx hash는 EVM hash와 다릅니다. EVM hash 대응·블록 hash 검색·validator/token 검색은 미지원입니다.</Typography>
  </Stack></CardContent></Card>;
}
