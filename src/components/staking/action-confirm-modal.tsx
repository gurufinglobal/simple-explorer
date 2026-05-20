"use client";

import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";

type ActionConfirmModalProps = {
  summary: string;
  warning: string;
  onConfirm?: () => void;
};

export function ActionConfirmModal({ summary, warning, onConfirm }: ActionConfirmModalProps) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1">실행 전 확인</Typography>
          <Typography variant="body2">{summary}</Typography>
          <Alert severity="warning">{warning}</Alert>
          <Button variant="contained" onClick={onConfirm ?? (() => undefined)}>
            최종 확인
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
