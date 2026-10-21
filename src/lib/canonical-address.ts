import { bech32 } from "bech32";
import type { ChainConfig } from "@/lib/env";

/** Account addresses only. No deployed chain currently has verified EVM/account mapping. */
export function canonicalAccountAddress(input: string, chain: ChainConfig): string {
  if (/^0x/i.test(input)) throw new Error("이 체인의 EVM→Cosmos 주소 대응은 검증되지 않았습니다. 검증된 계정 Bech32 주소를 사용하세요.");
  if (!chain.bech32Prefix) throw new Error("이 체인의 계정 주소 prefix가 확인되지 않아 주소 조회를 지원하지 않습니다.");
  if (!input || /\s/.test(input)) throw new Error("주소에 공백을 사용할 수 없습니다.");
  let decoded;
  try { decoded = bech32.decode(input); }
  catch { throw new Error("Bech32 주소 형식 또는 checksum이 올바르지 않습니다."); }
  if (decoded.prefix !== chain.bech32Prefix) throw new Error(`선택 체인의 주소 prefix는 ${chain.bech32Prefix}입니다.`);
  const bytes = bech32.fromWords(decoded.words);
  if (bytes.length !== 20 && bytes.length !== 32) throw new Error("계정 주소 bytes 길이가 올바르지 않습니다.");
  return bech32.encode(decoded.prefix, decoded.words);
}
