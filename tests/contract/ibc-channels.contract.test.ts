import { describe, expect, it } from "vitest";
import { getIbcChannelsPayload } from "@/server/handlers/ibc-channels.handler";

describe("ibc channels contract", () => {
  it("returns channels array", async () => {
    const result = await getIbcChannelsPayload();
    expect(result.status).toBe(200);
    expect(Array.isArray(result.body.channels)).toBe(true);
  });
});
