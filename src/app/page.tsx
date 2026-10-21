"use client";

import Link from "@/components/layout/chain-link";
import { Alert, Button, Container, Stack, Typography } from "@mui/material";
import { getConfiguredChains } from "@/lib/env";

export default function Home() {
  let chainNames: string[] = [];
  let configError: string | null = null;
  try { chainNames = getConfiguredChains().map(chain => chain.name); }
  catch (error) { configError = error instanceof Error ? error.message : "체인 설정을 확인할 수 없습니다."; }
  return (
    <Container sx={{ py: { xs: 4, md: 8 }, overflowWrap: "anywhere" }}>
      <Stack spacing={4}>
        <Stack spacing={2}>
          <Typography component="h1" variant="h3" fontWeight={800}>Gurufin Explorer</Typography>
          <Typography variant="h6" color="text.secondary">
            블록과 거래를 살펴보고, 네트워크 현황과 검증자 정보를 확인하세요.
          </Typography>
          <Typography>공개 정보 조회에는 지갑 연결이 필요하지 않습니다.</Typography>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button component={Link} href="/dashboard" variant="contained" size="large">Open Dashboard</Button>
          <Button component={Link} href="/blocks" variant="outlined" size="large">Start Block Exploration</Button>
        </Stack>
        <Stack spacing={2}>
          <Typography component="h2" variant="h5" fontWeight={700}>탐색 시작하기</Typography>
          <Typography>Dashboard에서 네트워크 현황을 확인하거나 Blocks에서 최근 블록을 선택하세요. 검색에는 블록 높이, Cosmos tx hash (hex), 계정 주소(Bech32)를 입력할 수 있습니다.</Typography>
          <Typography>Staking에서 검증자 목록과 상세 정보를, Governance에서 제안을, IBC Channels에서 채널 정보를 조회할 수 있습니다.</Typography>
          <Typography>작은 화면에서는 탐색 메뉴 열기 버튼으로 체인을 선택하고 각 화면으로 이동하세요. 공유 링크에 지정된 체인은 다음 화면에서도 유지됩니다.</Typography>
        </Stack>
        <Stack spacing={2}>
          <Typography component="h2" variant="h5" fontWeight={700}>조회 가능한 체인과 범위</Typography>
          {configError ? <Alert severity="error">{configError}</Alert> : <Typography>현재 설정된 체인: {chainNames.join(", ")}</Typography>}
          <Typography>각 체인의 공개 응답에 따라 조회 항목이 달라집니다. 불러오는 중, 일부 조회 실패, 미지원 안내를 확인하고 필요하면 다시 조회하세요.</Typography>
          <Alert severity="info">지갑 거래는 체인과 지갑 조합의 지원이 확인된 경우에만 사용할 수 있습니다. 조회 가능 여부가 서명·전송 지원을 뜻하지는 않습니다.</Alert>
        </Stack>
      </Stack>
    </Container>
  );
}
