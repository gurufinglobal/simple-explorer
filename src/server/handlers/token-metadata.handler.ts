import { getTokenMetadata } from "@/services/guru/token-metadata.service";
import type { HandlerResult } from "./types";

export async function getTokenMetadataByRef(
  tokenRef: string,
): Promise<HandlerResult<Awaited<ReturnType<typeof getTokenMetadata>> | { message: string }>> {
  const metadata = await getTokenMetadata(tokenRef);
  if (!metadata) {
    return { status: 404, body: { message: "토큰 정보를 찾을 수 없습니다." } };
  }
  return { status: 200, body: metadata };
}
