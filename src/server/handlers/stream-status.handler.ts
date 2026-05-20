import { getStreamSnapshot } from "@/services/realtime/stream-manager";
import type { HandlerResult } from "./types";

export function getStreamStatus(): HandlerResult<ReturnType<typeof getStreamSnapshot>> {
  return {
    status: 200,
    body: getStreamSnapshot(),
  };
}
