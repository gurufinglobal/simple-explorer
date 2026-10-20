"use client";

import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useParams } from "next/navigation";
import { Stack } from "@mui/material";
import { BlockDetailView } from "@/components/explorer/block-detail-view";
import { getBlockDetail } from "@/services/guru/block-details.service";

export default function BlockDetailPage() {
  const params = useParams<{ height: string }>();
  const height = params.height ?? "";
  const query = useQuery(`blocks:${height}`, client => getBlockDetail(height, client));
  return <Stack spacing={2}><QueryStatus {...query} />{query.result.data && <BlockDetailView key={height} block={query.result.data} />}</Stack>;
}
