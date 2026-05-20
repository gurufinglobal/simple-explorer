import { getNetworkSummary } from "@/services/guru/network-summary.service";
import type { HandlerResult } from "./types";

export async function getNetworkSummaryPayload(): Promise<
  HandlerResult<Awaited<ReturnType<typeof getNetworkSummary>>>
> {
  const summary = await getNetworkSummary();
  return {
    status: 200,
    body: summary,
  };
}
