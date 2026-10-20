"use client";
import type { UnbondingSnapshot } from "@/services/guru/unbonding.service";
import type { AmountMetadata } from "@/lib/cosmos-amount";
import { CoinAmount } from "./coin-amount";
export function UnbondingDetails({ snapshot, duration, metadata }: { snapshot: UnbondingSnapshot; duration?: string; metadata?: AmountMetadata[] }) {
  return <details><summary>언본딩 상세</summary>
    <p>현재 unbonding 기간: {duration ?? "미확인"} · 합계 조회 기준 높이: {snapshot.queryHeight ?? "미확인 (헤더 없음 또는 페이지 높이 불일치)"}</p>
    <CoinAmount coin={snapshot.total} metadata={metadata} />
    <p>완료 예정시각은 체인 응답입니다. 시간이 지나도 수령 완료를 뜻하지 않습니다.</p>
    <ul>{snapshot.entries.map((entry, i) => <li key={i}>
      {entry.validator} · <CoinAmount coin={entry} metadata={metadata} /> · 완료 예정 {entry.completionTime ?? "미확인"} · 조회 높이 {entry.queryHeight ?? "미확인"} · 생성 높이 {entry.creationHeight ?? "미확인"}
    </li>)}</ul>
  </details>;
}
