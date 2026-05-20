import type { ReactNode } from "react";
import { ExplorerShell } from "@/components/layout/explorer-shell";

export default function ExplorerLayout({ children }: { children: ReactNode }) {
  return <ExplorerShell>{children}</ExplorerShell>;
}
