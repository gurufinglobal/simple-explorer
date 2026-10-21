"use client";

import { useQuery } from "@/hooks/use-query";
import { QueryStatus } from "@/components/query/query-status";

import { useParams } from "next/navigation";
import { Alert, Stack } from "@mui/material";
import { BlockDetailView } from "@/components/explorer/block-detail-view";
import { getBlockDetail } from "@/services/guru/block-details.service";

import { normalizeBlockHeight } from "@/services/search/query-classifier";

export default function BlockDetailPage() {
  const params = useParams<{ height: string }>();
  let height: string;
  try { height = normalizeBlockHeight(params.height ?? ""); }
  catch (error) { return <Alert severity="error">{(error as Error).message}</Alert>; }
  return <BlockDetailContent height={height} />;
}
function BlockDetailContent({ height }: { height: string }) {
  const query = useQuery(`blocks:${height}`, client => getBlockDetail(height, client));
  return <Stack spacing={2}><QueryStatus {...query} />{query.result.data && <BlockDetailView key={height} block={query.result.data} />}</Stack>;
}
