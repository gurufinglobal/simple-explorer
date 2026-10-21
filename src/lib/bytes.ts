/** Strict LCD base64 bytes → uppercase hex. Never reinterpret an identifier as an account or tx. */
export function lcdBytesToHex(base64: string): string | null {
  if (!base64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) return null;
  try {
    const binary = atob(base64);
    if (btoa(binary) !== base64) return null;
    return Array.from(binary, char => char.charCodeAt(0).toString(16).padStart(2, "0")).join("").toUpperCase();
  } catch { return null; }
}
