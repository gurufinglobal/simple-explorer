import { getAddressBalances } from "@/services/guru/address-profile.service";
import { getBlockDetail } from "@/services/guru/block-details.service";
import { getTxDetail } from "@/services/guru/tx-details.service";
import { resolveSearch } from "./search-resolve.handler";
import type { HandlerResult } from "./types";

type SearchLookupSuccessPayload =
  | {
      resolvedType: "txHash";
      data: Awaited<ReturnType<typeof getTxDetail>>;
    }
  | {
      resolvedType: "address";
      data: Awaited<ReturnType<typeof getAddressBalances>>;
    }
  | {
      resolvedType: "blockHeight";
      data: Awaited<ReturnType<typeof getBlockDetail>>;
    };

type SearchLookupPayload =
  | SearchLookupSuccessPayload
  | { message: string; resolvedType?: "validator" | "token" };

export async function lookupByQuery(queryInput?: string): Promise<HandlerResult<SearchLookupPayload>> {
  const resolution = resolveSearch(queryInput);
  if (resolution.status !== 200) {
    return {
      status: resolution.status,
      body: { message: "query는 필수입니다." },
    };
  }

  const body = resolution.body;
  if (!("resolvedType" in body)) {
    return {
      status: 500,
      body: { message: "검색 판별 결과가 올바르지 않습니다." },
    };
  }
  const resolvedType = body.resolvedType;
  const query = (queryInput ?? "").trim();

  if (resolvedType === "txHash") {
    const txDetail = await getTxDetail(query);
    return {
      status: txDetail ? 200 : 404,
      body: txDetail
        ? { resolvedType, data: txDetail }
        : { message: "트랜잭션 정보를 찾을 수 없습니다." },
    };
  }

  if (resolvedType === "address") {
    const balances = await getAddressBalances(query);
    return {
      status: 200,
      body: { resolvedType, data: balances },
    };
  }

  if (resolvedType === "blockHeight") {
    const blockDetail = await getBlockDetail(query);
    return {
      status: blockDetail ? 200 : 404,
      body: blockDetail
        ? { resolvedType, data: blockDetail }
        : { message: "블록 정보를 찾을 수 없습니다." },
    };
  }

  return {
    status: 422,
    body: {
      resolvedType,
      message: `${resolvedType} 유형의 상세 조회는 아직 지원하지 않습니다.`,
    },
  };
}
