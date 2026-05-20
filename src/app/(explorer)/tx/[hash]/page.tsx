"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { getTxDetail, type TxDetail } from "@/services/guru/tx-details.service";

export default function TxDetailPage() {
  const params = useParams<{ hash: string }>();
  const hash = params.hash ?? "";
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const next = await getTxDetail(hash);
        if (!mounted) return;
        setTx(next);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [hash]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          트랜잭션 상세
        </Typography>
        <Typography>트랜잭션 정보를 불러오는 중입니다.</Typography>
      </Stack>
    );
  }

  if (!tx) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          트랜잭션 상세
        </Typography>
        <Typography>트랜잭션 정보를 가져오지 못했습니다.</Typography>
      </Stack>
    );
  }

  const gasUsedNumber = Number(tx.gasUsed);
  const gasWantedNumber = Number(tx.gasWanted);
  const gasRatio =
    Number.isFinite(gasUsedNumber) && Number.isFinite(gasWantedNumber) && gasWantedNumber > 0
      ? `${((gasUsedNumber / gasWantedNumber) * 100).toFixed(2)}%`
      : "-";

  const timestampLabel = tx.timestamp ? new Date(tx.timestamp).toLocaleString("ko-KR") : "-";
  const statusLabel = tx.code === 0 ? "Success" : "Failed";
  const statusColor = tx.code === 0 ? "success" : "error";
  const feeLabel = tx.feeAmount.length > 0 ? tx.feeAmount.map((coin) => `${coin.amount} ${coin.denom}`).join(", ") : "-";

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }}>
        <Typography variant="h5" fontWeight={700}>
          트랜잭션 상세
        </Typography>
        <Chip size="small" label={statusLabel} color={statusColor} />
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.25}>
            <Typography variant="subtitle2" color="text.secondary">
              요약
            </Typography>
            <Typography sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
              <strong>Hash:</strong> {tx.hash}
            </Typography>
            <Typography>
              <strong>Height:</strong>{" "}
              {tx.height !== "0" ? (
                <Link href={`/blocks/${tx.height}`} style={{ color: "inherit" }}>
                  {tx.height}
                </Link>
              ) : (
                "-"
              )}
            </Typography>
            <Typography>
              <strong>Timestamp:</strong> {timestampLabel}
            </Typography>
            <Typography>
              <strong>Code:</strong> {tx.code}
              {tx.codespace ? ` (${tx.codespace})` : ""}
            </Typography>
            <Typography>
              <strong>Messages:</strong> {tx.messages.length}
            </Typography>
            <Typography>
              <strong>Memo:</strong> {tx.memo || "-"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.25}>
            <Typography variant="subtitle2" color="text.secondary">
              실행 정보
            </Typography>
            <Typography>
              <strong>Gas Used:</strong> {tx.gasUsed}
            </Typography>
            <Typography>
              <strong>Gas Wanted:</strong> {tx.gasWanted}
            </Typography>
            <Typography>
              <strong>Gas Utilization:</strong> {gasRatio}
            </Typography>
            <Typography>
              <strong>Fee:</strong> {feeLabel}
            </Typography>
            <Typography>
              <strong>Fee Payer:</strong> {tx.feePayer || "-"}
            </Typography>
            <Typography>
              <strong>Fee Granter:</strong> {tx.feeGranter || "-"}
            </Typography>
            <Typography>
              <strong>Timeout Height:</strong> {tx.timeoutHeight}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            메시지 타입
          </Typography>
          {tx.messages.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              메시지 정보가 없습니다.
            </Typography>
          ) : (
            <List dense disablePadding>
              {tx.messages.map((message, index) => (
                <ListItem key={`${message.typeUrl}-${index}`} disablePadding sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={message.shortType}
                    secondary={
                      <Typography variant="caption" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                        {message.typeUrl}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            관련 주소
          </Typography>
          {tx.participantAddresses.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              주소 정보를 추출하지 못했습니다.
            </Typography>
          ) : (
            <Stack spacing={0.75}>
              {tx.participantAddresses.map((address) => (
                <Typography key={address} variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                  <Link href={`/address/${address}`} style={{ color: "inherit" }}>
                    {address}
                  </Link>
                </Typography>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Raw Log
          </Typography>
          <Divider sx={{ mb: 1 }} />
          <Typography
            component="pre"
            variant="caption"
            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace", m: 0 }}
          >
            {tx.rawLog || "-"}
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
