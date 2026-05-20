import { getIbcChannels } from "@/services/guru/ibc-channels.service";
import type { HandlerResult } from "./types";

export async function getIbcChannelsPayload(): Promise<
  HandlerResult<{ channels: Awaited<ReturnType<typeof getIbcChannels>> }>
> {
  return {
    status: 200,
    body: { channels: await getIbcChannels() },
  };
}
