function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function bytesToHexUpper(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Cosmos-style tx hash (uppercase hex SHA-256 of raw tx bytes from block `data.txs`). */
export async function txRawBase64ToTxHashHex(base64Tx: string): Promise<string> {
  const bytes = base64ToBytes(base64Tx);
  const digestInput = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return bytesToHexUpper(new Uint8Array(digest));
}
