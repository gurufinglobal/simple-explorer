
import { serviceMessage } from '@/i18n/service-message';
import { bech32 } from "bech32";

type SendAddressValidation =
  | { status: "valid"; message: null }
  | { status: "invalid" | "unverified"; message: string };

/** MsgSend retains the existing 20-byte account contract, separate from lookup addresses. */
export function validateSendAddress(address: string, chainPrefix: string | undefined): SendAddressValidation {
  let prefix: string;
  try {
    const decoded = bech32.decode(address.trim());
    if (bech32.fromWords(decoded.words).length !== 20) throw new Error();
    prefix = decoded.prefix;
  } catch {
    return { status: "invalid", ...serviceMessage("check_the_recipient_address_format_checksum_and_20_byte_length") };
  }
  if (!chainPrefix) {
    return { status: "unverified", ...serviceMessage("the_chain_prefix_is_unverified_so_the_recipient_s_chain") };
  }
  if (prefix !== chainPrefix) {
    return { status: "invalid", ...serviceMessage("recipient_prefix_differs_from_the_selected_chain") };
  }
  return { status: "valid", message: null };
}
