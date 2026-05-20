import { describe, expect, it } from "vitest";
import { txRawBase64ToTxHashHex } from "@/lib/tx-hash";

describe("txRawBase64ToTxHashHex", () => {
  it("matches SHA-256 of empty buffer (uppercase hex)", async () => {
    expect(await txRawBase64ToTxHashHex("")).toBe(
      "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855",
    );
  });
});
