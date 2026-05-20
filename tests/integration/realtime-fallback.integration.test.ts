import { describe, expect, it } from "vitest";
import {
  getStreamSnapshot,
  markWsConnected,
  markWsDisconnected,
} from "@/services/realtime/stream-manager";

describe("realtime fallback integration", () => {
  it("enables polling when websocket disconnected", () => {
    markWsDisconnected();
    const broken = getStreamSnapshot();
    expect(broken.wsConnected).toBe(false);
    expect(broken.fallbackPolling).toBe(true);

    markWsConnected();
    const restored = getStreamSnapshot();
    expect(restored.wsConnected).toBe(true);
    expect(restored.fallbackPolling).toBe(false);
  });
});
