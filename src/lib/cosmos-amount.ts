
import { ServiceError, serviceText } from '@/i18n/service-message';
import { schemaError } from "./query-result";

/** All quantities stay decimal strings; Number is only used for bounded exponents. */
export type Coin = { amount: string; denom: string };
export type AmountMetadata = { baseDenom: string; displayDenom: string; symbol: string; decimals: number | null };

export function decimalParts(value: string): [bigint, number] {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new ServiceError("invalid_raw_amount");
  const [whole, fraction = ""] = value.split(".");
  return [BigInt(whole + fraction), fraction.length];
}
export function addDecimal(a: string, b: string): string {
  const [av, ap] = decimalParts(a), [bv, bp] = decimalParts(b);
  const places = Math.max(ap, bp);
  const value = av * BigInt(10) ** BigInt(places - ap) + bv * BigInt(10) ** BigInt(places - bp);
  return decimalString(value, places);
}
function decimalString(value: bigint, places: number): string {
  if (!places) return value.toString();
  const digits = value.toString().padStart(places + 1, "0");
  const fraction = digits.slice(-places).replace(/0+$/, "");
  return digits.slice(0, -places) + (fraction ? `.${fraction}` : "");
}
export function sumCoins(coins: Coin[]): Coin[] {
  const sums = new Map<string, string>();
  for (const coin of coins) {
    if (!coin || !coin.denom || typeof coin.amount !== "string" || !/^\d+(?:\.\d+)?$/.test(coin.amount)) schemaError(serviceText("invalid_raw_amount_or_denom"));
    sums.set(coin.denom, addDecimal(sums.get(coin.denom) ?? "0", coin.amount));
  }
  return [...sums].map(([denom, amount]) => ({ denom, amount }));
}
export function assertBaseAmount(value: string): void {
  if (!/^\d+$/.test(value) || BigInt(value) <= BigInt(0)) throw new ServiceError("amount_must_be_a_positive_integer_in_base_units");
}
export function displayToBase(value: string, decimals: number | null | undefined): string {
  if (decimals == null || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new ServiceError("display_precision_unknown_sending_is_blocked");
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new ServiceError("enter_a_positive_decimal_amount_using_a_period_exponents_negative");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new ServiceError("exceeds_the_allowed_decimal_places", { value0: String(decimals) });
  const base = BigInt(whole + fraction.padEnd(decimals, "0")).toString();
  assertBaseAmount(base);
  return base;
}
export function formatCoin(coin: Coin, metadata?: AmountMetadata | null): string {
  const [value, places] = decimalParts(coin.amount);
  if (!metadata || metadata.baseDenom !== coin.denom || metadata.decimals == null) return serviceText("precision_unknown", { value0: String(coin.amount), value1: String(coin.denom) });
  const scale = places + metadata.decimals;
  const text = decimalString(value, scale);
  const [whole, fraction = ""] = text.split(".");
  const clipped = fraction.slice(0, 6).replace(/0+$/, "");
  const unit = metadata.symbol || metadata.displayDenom;
  if (value > BigInt(0) && whole === "0" && !clipped) return `<0.000001 ${unit}`;
  return `${whole}${clipped ? `.${clipped}` : ""} ${unit}`;
}
export function formatCoins(coins: Coin[], metadata: AmountMetadata[] = []): string {
  return coins.map(c => formatCoin(c, metadata.find(m => m.baseDenom === c.denom))).join(", ");
}
