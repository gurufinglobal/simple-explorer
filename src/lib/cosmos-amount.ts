/**
 * Format base units (e.g. agxn with 10^18) as human-readable gxn label.
 */
export function formatBaseAmountToGxn(rawAmount: string | undefined): string {
  return formatBaseAmount(rawAmount, "gxn");
}

/**
 * Format base units (10^18) as human-readable token label.
 */
export function formatBaseAmount(rawAmount: string | undefined, displayDenom: string): string {
  const normalized = rawAmount && /^[0-9]+$/.test(rawAmount) ? rawAmount : "0";
  const amount = BigInt(normalized);
  const unit = BigInt(10) ** BigInt(18);
  const whole = amount / unit;
  const fraction = amount % unit;
  const fractionText = fraction.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole.toString()}${fractionText ? `.${fractionText}` : ""} ${displayDenom}`;
}
