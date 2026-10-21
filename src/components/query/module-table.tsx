import type { ReactNode } from "react";
import { Table } from "@mui/material";

// Prose may wrap anywhere, but raw numbers and headers must remain readable.
// Long descriptive fields opt into wrapping at a usable column width.
export const moduleTextCellSx = {
  minWidth: 240,
  maxWidth: 320,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
} as const;

export function ModuleTable({ children }: { children: ReactNode }) {
  return (
    <div role="region" aria-label="모듈 표 가로 스크롤" tabIndex={0} style={{ maxWidth: "100%", overflowX: "auto" }}>
      <Table size="small" sx={{ minWidth: 640, whiteSpace: "nowrap", overflowWrap: "normal", wordBreak: "normal" }}>
        {children}
      </Table>
    </div>
  );
}
