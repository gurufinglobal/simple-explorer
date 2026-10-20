"use client";

import { useId, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

export function MetricRawDetails({ label, raw }: { label: string; raw?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <Box sx={{ mt: 1, minWidth: 0 }}>
    <Button size="small" startIcon={<InfoOutlinedIcon />} aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)} sx={{ px: 0.5 }}>
      {label} 원본
    </Button>
    <Box id={id} hidden={!open} sx={{ mt: 1, p: 1, bgcolor: "action.hover", borderRadius: 1 }}>
      <Typography variant="caption" color="text.secondary">{label} · 최소 단위</Typography>
      <Typography variant="body2" sx={{ overflowWrap: "anywhere", fontFamily: "monospace" }}>{raw ?? `${label} 원본 미확인`}</Typography>
    </Box>
  </Box>;
}
