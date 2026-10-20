"use client";

import { useId, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { QueryStatus, type QueryStatusProps } from "@/components/query/query-status";

/** Successful reads stay quiet; every other source state remains visible. */
export function DashboardQueryInfo({ queries }: { queries: (QueryStatusProps & { label: string })[] }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const completed = queries.filter(query => query.result.status === "success" && !query.busy).length;

  return <Box component="section" aria-label="Dashboard 조회 정보" sx={{ border: 1, borderColor: "divider", borderRadius: 2, px: 2, py: 1, minWidth: 0 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
      <Button size="small" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls={id}
        endIcon={<ExpandMoreIcon sx={{ transform: expanded ? "rotate(180deg)" : undefined }} />}>
        조회 정보
      </Button>
      <Typography variant="caption" color="text.secondary" role="status">{completed}/{queries.length}개 조회 완료</Typography>
    </Stack>
    <Stack id={id} spacing={1}>
      {queries.map(({ label, ...query }) => {
        const visible = expanded || query.result.status !== "success" || query.busy;
        return visible ? <Box key={label} sx={{ pt: 1, borderTop: 1, borderColor: "divider" }}>
          <QueryStatus {...query} compactLabel={label} showDetails={expanded} />
        </Box> : null;
      })}
    </Stack>
  </Box>;
}
