"use client";
import { useServiceText } from "@/i18n/use-service-text";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { formatCoin, type AmountMetadata, type Coin } from "@/lib/cosmos-amount";
export function CoinAmount({ coin, metadata }: { coin: Coin; metadata?: AmountMetadata[] }) {
  const t = useTranslations("transaction");
  const st = useServiceText();
  const [open, setOpen] = useState(false);
  let display: string;
  try { display = formatCoin(coin, metadata?.find(m => m.baseDenom === coin.denom)); }
  catch { display = t("amountUnknown"); }
  return <span>{st(display)}<button type="button" aria-expanded={open} onClick={event => { event.stopPropagation(); setOpen(!open); }}>{t("raw_amount")}</button><span hidden={!open}><span>{coin.amount} {coin.denom}</span>{coin.amount.includes(".") && <span>  {t("fractional_rewards_in_base_units_differ_from_integer_transfer")}</span>}</span></span>;
}
