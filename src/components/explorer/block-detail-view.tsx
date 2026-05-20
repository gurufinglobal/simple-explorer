"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import type { BlockDetail } from "@/services/guru/block-details.service";

function mono(value: string) {
  return (
    <Typography component="span" variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
      {value}
    </Typography>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.5, sm: 2 }}
      sx={{ py: 0.75, alignItems: { sm: "flex-start" } }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: { sm: 200 }, flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Stack sx={{ flex: 1, minWidth: 0 }}>{children}</Stack>
    </Stack>
  );
}

function previousBlockHeight(block: BlockDetail): string | null {
  const lc = block.lastCommitHeight;
  if (lc && lc !== "-" && /^\d+$/.test(lc)) {
    return lc;
  }
  try {
    const n = BigInt(block.height);
    const one = BigInt(1);
    if (n <= one) {
      return null;
    }
    return String(n - one);
  } catch {
    return null;
  }
}

type Props = {
  block: BlockDetail;
};

export function BlockDetailView({ block }: Props) {
  const prevH = previousBlockHeight(block);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        블록 상세
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            요약
          </Typography>
          <DetailRow label="높이">{mono(block.height)}</DetailRow>
          <DetailRow label="체인 ID">{mono(block.chainId)}</DetailRow>
          <DetailRow label="블록 시간">{mono(block.time)}</DetailRow>
          <DetailRow label="블록 ID 해시">{mono(block.hash)}</DetailRow>
          <DetailRow label="제안자">{mono(block.proposer)}</DetailRow>
          <DetailRow label="트랜잭션 수">
            <Typography variant="body2">{block.txCount}</Typography>
          </DetailRow>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            프로토콜 버전
          </Typography>
          <DetailRow label="Block version">
            <Typography variant="body2">{block.blockVersion}</Typography>
          </DetailRow>
          <DetailRow label="App version">
            <Typography variant="body2">{block.appVersion}</Typography>
          </DetailRow>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            이전 블록 · 커밋
          </Typography>
          <DetailRow label="이전 블록 해시">{mono(block.lastBlockHash)}</DetailRow>
          {prevH ? (
            <DetailRow label="이전 블록으로 이동">
              <Link href={`/blocks/${prevH}`} style={{ textDecoration: "none" }}>
                <Typography color="primary" variant="body2">
                  높이 {prevH} 보기
                </Typography>
              </Link>
            </DetailRow>
          ) : null}
          <Divider sx={{ my: 1 }} />
          <DetailRow label="라스트 커밋 해시">{mono(block.lastCommitHash)}</DetailRow>
          <DetailRow label="라스트 커밋 대상 높이">{mono(block.lastCommitHeight)}</DetailRow>
          <DetailRow label="라스트 커밋 라운드">
            <Typography variant="body2">{block.lastCommitRound}</Typography>
          </DetailRow>
          <DetailRow label="커밋 서명 수">
            <Typography variant="body2">{block.commitSignaturesCount}</Typography>
          </DetailRow>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Merkle 루트 (헤더)
          </Typography>
          <DetailRow label="데이터">{mono(block.dataHash)}</DetailRow>
          <DetailRow label="검증인 집합">{mono(block.validatorsHash)}</DetailRow>
          <DetailRow label="다음 검증인 집합">{mono(block.nextValidatorsHash)}</DetailRow>
          <DetailRow label="컨센서스">{mono(block.consensusHash)}</DetailRow>
          <DetailRow label="앱 상태">{mono(block.appHash)}</DetailRow>
          <DetailRow label="직전 실행 결과">{mono(block.lastResultsHash)}</DetailRow>
          <DetailRow label="증거 루트">{mono(block.evidenceHash)}</DetailRow>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            증거
          </Typography>
          <DetailRow label="Evidence 항목 수">
            <Typography variant="body2">{block.evidenceCount}</Typography>
          </DetailRow>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            트랜잭션
          </Typography>
          {block.txs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              이 블록에 포함된 트랜잭션이 없습니다.
            </Typography>
          ) : (
            <List disablePadding dense>
              {block.txs.map((tx, index) => (
                <ListItem key={`${tx.hash}-${index}`} divider disablePadding sx={{ py: 1, display: "block" }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Typography variant="caption" color="text.secondary" sx={{ pt: 0.25, flexShrink: 0 }}>
                      #{index + 1}
                    </Typography>
                    <ListItemText
                      primary={
                        <Link href={`/tx/${tx.hash}`} style={{ textDecoration: "none", color: "inherit" }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: "monospace",
                              wordBreak: "break-all",
                              "&:hover": { textDecoration: "underline" },
                            }}
                          >
                            {tx.hash}
                          </Typography>
                        </Link>
                      }
                    />
                  </Stack>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
