"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { ValidatorsTable } from "@/components/staking/validators-table";
import { getTopValidators, type ValidatorSummary } from "@/services/guru/staking.service";

export default function StakingPage() {
  const [validators, setValidators] = useState<ValidatorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const next = await getTopValidators(20);
        if (!mounted) return;
        setValidators(next);
        setError(null);
      } catch {
        if (!mounted) return;
        setValidators([]);
        setError("검증자 데이터를 불러오지 못했습니다.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        Staking
      </Typography>
      {loading ? <CircularProgress size={22} /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      <ValidatorsTable validators={validators} />
    </Stack>
  );
}
