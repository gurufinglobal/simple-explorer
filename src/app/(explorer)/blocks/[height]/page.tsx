"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Stack, Typography } from "@mui/material";
import { BlockDetailView } from "@/components/explorer/block-detail-view";
import { getBlockDetail, type BlockDetail } from "@/services/guru/block-details.service";

export default function BlockDetailPage() {
  const params = useParams<{ height: string }>();
  const height = params.height ?? "";
  const [block, setBlock] = useState<BlockDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const next = await getBlockDetail(height);
        if (!mounted) return;
        setBlock(next);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [height]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          블록 상세
        </Typography>
        <Typography>블록 정보를 불러오는 중입니다.</Typography>
      </Stack>
    );
  }

  if (!block) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={700}>
          블록 상세
        </Typography>
        <Typography>블록 정보를 가져오지 못했습니다.</Typography>
      </Stack>
    );
  }

  return <BlockDetailView block={block} />;
}
