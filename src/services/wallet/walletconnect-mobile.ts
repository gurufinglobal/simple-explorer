import type { WalletConnectMode } from "@/types/walletconnect";

/** Keplr URLs follow its official wc-qrcode-modal 0.13.41. No automatic navigation. */
export function walletConnectMobileLink(uri: string, mode: WalletConnectMode, userAgent: string): string | null {
  // Pairing URIs contain a symmetric key; reject injection and never persist/log them.
  if (!/^wc:[a-zA-Z0-9_-]+@2\?[^\s#]+$/.test(uri)) return null;
  if (mode === "keplr") {
    if (/android/i.test(userAgent)) return `intent://wcV2?${uri}#Intent;package=com.chainapsis.keplr;scheme=keplrwallet;end;`;
    if (/iphone|ipad|ipod/i.test(userAgent)) return `keplrwallet://wcV2?${uri}`;
    return null;
  }
  // Generic WC handlers are wallet-dependent. Offer URI copy/QR as fallback.
  return uri;
}
