
import { ServiceError } from '@/i18n/service-message';
import { bech32 } from "bech32";
import type { ChainConfig } from "@/lib/env";

/** Account addresses only. No deployed chain currently has verified EVM/account mapping. */
export function canonicalAccountAddress(input: string, chain: ChainConfig): string {
  if (/^0x/i.test(input)) throw new ServiceError("evm_to_cosmos_address_mapping_is_unverified_for_this_chain");
  if (!chain.bech32Prefix) throw new ServiceError("address_queries_are_unsupported_because_this_chain_s_account_prefix");
  if (!input || /\s/.test(input)) throw new ServiceError("addresses_cannot_contain_whitespace");
  let decoded;
  try { decoded = bech32.decode(input); }
  catch { throw new ServiceError("invalid_bech32_address_format_or_checksum"); }
  if (decoded.prefix !== chain.bech32Prefix) throw new ServiceError("the_selected_chain_s_address_prefix_is", { value0: String(chain.bech32Prefix) });
  const bytes = bech32.fromWords(decoded.words);
  if (bytes.length !== 20 && bytes.length !== 32) throw new ServiceError("invalid_account_address_byte_length");
  return bech32.encode(decoded.prefix, decoded.words);
}
