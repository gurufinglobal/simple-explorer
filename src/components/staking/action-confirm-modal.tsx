"use client";
import { useTranslations } from "next-intl";


import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";

type ActionConfirmModalProps = {
  summary: string;
  warning: string;
  onConfirm?: () => void;
};

export function ActionConfirmModal({ summary, warning, onConfirm }: ActionConfirmModalProps) {
  const t = useTranslations("staking");
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1">{t("review_before_execution")}</Typography>
          <Typography variant="body2">{summary}</Typography>
          <Alert severity="warning">{warning}</Alert>
          <Button variant="contained" onClick={onConfirm ?? (() => undefined)}>
             {t("final_confirmation")} </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
