"use client";
import { useState } from "react";
import { formatCoin, type AmountMetadata, type Coin } from "@/lib/cosmos-amount";
export function CoinAmount({ coin, metadata }: { coin: Coin; metadata?: AmountMetadata[] }) {
  const [open, setOpen] = useState(false);
  let display: string;
  try { display = formatCoin(coin, metadata?.find(m => m.baseDenom === coin.denom)); }
  catch { display = "금액 미확인"; }
  return <span>{display}<button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>원본 금액</button><span hidden={!open}><span>{coin.amount} {coin.denom}</span>{coin.amount.includes(".") && <span> · 소수 최소 단위 보상: 전송 정수와 다릅니다.</span>}</span></span>;
}
