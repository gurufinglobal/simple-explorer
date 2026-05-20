export type ResolvedType = "txHash" | "address" | "blockHeight" | "validator" | "token";

const txHashPattern = /^[0-9a-fA-F]{64}$/;
const evmAddressPattern = /^0x[0-9a-fA-F]{40}$/;
const bech32Pattern = /^guru[0-9a-z]{20,}$/;
const blockHeightPattern = /^[1-9][0-9]*$/;

export function classifyQuery(query: string): {
  resolvedType: ResolvedType;
  hasConflict: boolean;
  candidates: ResolvedType[];
} {
  const value = query.trim();
  const candidates: ResolvedType[] = [];

  if (txHashPattern.test(value)) candidates.push("txHash");
  if (evmAddressPattern.test(value) || bech32Pattern.test(value)) candidates.push("address");
  if (blockHeightPattern.test(value)) candidates.push("blockHeight");

  if (value.startsWith("validator")) candidates.push("validator");
  if (value.startsWith("token:")) candidates.push("token");

  const priority: ResolvedType[] = ["txHash", "address", "blockHeight", "validator", "token"];
  const resolvedType = priority.find((item) => candidates.includes(item)) ?? "token";

  return {
    resolvedType,
    hasConflict: candidates.length > 1,
    candidates: candidates.length > 0 ? candidates : ["token"],
  };
}
