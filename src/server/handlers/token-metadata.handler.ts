
import { serviceMessage } from '@/i18n/service-message';
import { getTokenMetadata } from "@/services/guru/token-metadata.service";
import type { HandlerResult } from "./types";

export async function getTokenMetadataByRef(
  tokenRef: string,
): Promise<HandlerResult<Awaited<ReturnType<typeof getTokenMetadata>> | { message: string }>> {
  const metadata = await getTokenMetadata(tokenRef);
  if (!metadata) {
    return { status: 404, body: { ...serviceMessage("token_information_not_found") } };
  }
  return { status: 200, body: metadata };
}
