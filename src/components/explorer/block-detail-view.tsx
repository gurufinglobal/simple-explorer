"use client";

import Link from "@/components/layout/chain-link";
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

import { EncodedBytes } from "./encoded-bytes";
import { CopyPageLink } from "./copy-value";

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

      <CopyPageLink />
      <Typography variant="caption">블록 해시·헤더 bytes는 hex 기본 표시와 LCD base64 원문을 제공합니다. 블록 해시 검색은 미지원입니다.</Typography>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            요약
          </Typography>
          <DetailRow label="높이">{mono(block.height)}</DetailRow>
          <DetailRow label="체인 ID">{mono(block.chainId)}</DetailRow>
          <DetailRow label="블록 시간">{mono(block.time)}</DetailRow>
          <DetailRow label="블록 ID 해시 (hex)"><EncodedBytes label="블록 ID 해시" base64={block.hash} /></DetailRow>
          <DetailRow label="제안자 consensus bytes (hex)"><EncodedBytes label="제안자 consensus bytes" base64={block.proposer} /><Typography variant="caption">계정/valoper 주소로 변환하지 않습니다.</Typography></DetailRow>
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
          <DetailRow label="이전 블록 해시"><EncodedBytes label="lastBlockHash" base64={block.lastBlockHash} /></DetailRow>
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
          <DetailRow label="라스트 커밋 해시"><EncodedBytes label="lastCommitHash" base64={block.lastCommitHash} /></DetailRow>
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
          <DetailRow label="데이터"><EncodedBytes label="dataHash" base64={block.dataHash} /></DetailRow>
          <DetailRow label="검증인 집합"><EncodedBytes label="validatorsHash" base64={block.validatorsHash} /></DetailRow>
          <DetailRow label="다음 검증인 집합"><EncodedBytes label="nextValidatorsHash" base64={block.nextValidatorsHash} /></DetailRow>
          <DetailRow label="컨센서스"><EncodedBytes label="consensusHash" base64={block.consensusHash} /></DetailRow>
          <DetailRow label="앱 상태"><EncodedBytes label="appHash" base64={block.appHash} /></DetailRow>
          <DetailRow label="직전 실행 결과"><EncodedBytes label="lastResultsHash" base64={block.lastResultsHash} /></DetailRow>
          <DetailRow label="증거 루트"><EncodedBytes label="evidenceHash" base64={block.evidenceHash} /></DetailRow>
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
