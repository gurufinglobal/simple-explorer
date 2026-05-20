import { describe, expect, it } from "vitest";
import { getTokenMetadataByRef } from "@/server/handlers/token-metadata.handler";

describe("token metadata contract", () => {
  it("returns token metadata", async () => {
    const result = await getTokenMetadataByRef("uguru");
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("tokenType");
    expect(result.body).toHaveProperty("symbol");
  });

  it("returns 404 for unknown token", async () => {
    const result = await getTokenMetadataByRef("unknown-token");
    expect(result.status).toBe(404);
    expect(result.body).toHaveProperty("message");
  });
});
