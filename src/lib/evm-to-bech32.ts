import { ServiceError } from "@/i18n/service-message";
import { bech32 } from "bech32";

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isEthereumAddress(value: string): boolean {
  return ETH_ADDRESS_RE.test(value);
}

/**
 * Ethermint-style mapping: Cosmos account bytes match the 20-byte EVM address.
 */
export function ethToCosmosBech32(hexAddress: string, hrp: string): string {
  const hexDigits = hexAddress.replace(/^0x/i, "");
  if (hexDigits.length !== 40 || !/^[0-9a-fA-F]{40}$/.test(hexDigits)) {
    throw new ServiceError("invalid_evm_address");
  }
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(hexDigits.slice(i * 2, i * 2 + 2), 16);
  }
  const words = bech32.toWords(bytes);
  return bech32.encode(hrp, words);
}
