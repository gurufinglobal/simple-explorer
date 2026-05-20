"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { getStreamSnapshot, markWsConnected } from "@/services/realtime/stream-manager";

type StreamStatus = {
  wsConnected: boolean;
  fallbackPolling: boolean;
  reconnectAttempts: number;
  lastEventAt: string;
};

export function StreamStatus() {
  const [status, setStatus] = useState<StreamStatus | null>(null);

  useEffect(() => {
    try {
      markWsConnected();
      setStatus(getStreamSnapshot());
    } catch {
      setStatus(null);
    }
  }, []);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h6">실시간 스트림 상태</Typography>
          <Stack direction="row" spacing={1}>
            <Chip
              label={`WS: ${status?.wsConnected ? "정상" : "장애"}`}
              color={status?.wsConnected ? "success" : "warning"}
              size="small"
            />
            <Chip
              label={`Polling: ${status?.fallbackPolling ? "활성" : "비활성"}`}
              color={status?.fallbackPolling ? "info" : "default"}
              size="small"
            />
          </Stack>
          <Typography variant="body2">재연결 시도: {status?.reconnectAttempts ?? 0}</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
