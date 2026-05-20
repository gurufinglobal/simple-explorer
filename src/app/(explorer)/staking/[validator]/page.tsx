"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Stack, Typography } from "@mui/material";
import { ValidatorDetailView } from "@/components/staking/validator-detail-view";
import { getValidatorDetail, type ValidatorDetail } from "@/services/guru/staking.service";

export default function ValidatorDetailPage() {
  const params = useParams<{ validator: string }>();
  const validator = params.validator ?? "";
  const [detail, setDetail] = useState<ValidatorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const next = await getValidatorDetail(validator);
        if (!mounted) return;
        setDetail(next);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [validator]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          Validator 상세
        </Typography>
        <Typography>검증자 상세 정보를 불러오는 중입니다.</Typography>
      </Stack>
    );
  }

  if (!detail) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          Validator 상세
        </Typography>
        <Typography>검증자 상세 정보를 불러오지 못했습니다.</Typography>
      </Stack>
    );
  }

  return <ValidatorDetailView detail={detail} />;
}
