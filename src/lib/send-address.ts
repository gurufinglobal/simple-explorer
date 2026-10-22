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
    return { status: "invalid", message: "수신 주소의 형식·체크섬·길이(20바이트)를 확인하세요." };
  }
  if (!chainPrefix) {
    return { status: "unverified", message: "선택 체인의 주소 prefix가 확인되지 않아 수신 주소의 체인 일치 여부를 검증할 수 없습니다. 송금은 차단됩니다." };
  }
  if (prefix !== chainPrefix) {
    return { status: "invalid", message: "수신 주소의 prefix가 선택 체인과 다릅니다." };
  }
  return { status: "valid", message: null };
}
