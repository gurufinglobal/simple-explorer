// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../helpers/render";
import { NetworkSummaryPanel } from "@/components/network/network-summary-panel";
import { mockNetworkSummaryHttp, restoreHttpBoundary } from "../helpers/network-summary";

beforeEach(() => { mockNetworkSummaryHttp(); });
afterEach(() => { cleanup(); restoreHttpBoundary(); });

describe("network summary DOM", () => {
  it("shows partial supply as unknown for minimal TGXN instead of zero", async () => {
    const http = mockNetworkSummaryHttp();
    vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify([{ key: "tgxn", name: "TGXN", lcdUrl: "https://tgxn.gurufin.io:1317" }]));
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "tgxn");
    render(<NetworkSummaryPanel />);
    expect(await screen.findByText("fixture-chain-1")).toBeTruthy();
    expect(screen.getByText(/native denom/)).toBeTruthy();
    expect(screen.getByText(/공급 미확인/)).toBeTruthy();
    expect(screen.queryByText("0 GXN")).toBeNull();
    expect(screen.queryByText("123456789.012345 GXN")).toBeNull();
    expect(http.mock.calls.some(([url]) => String(url).includes("/supply/"))).toBe(false);
  });
  it("renders metrics obtained through the real service and HTTP client", async () => {
    render(<NetworkSummaryPanel />);
    expect(screen.getByText("체인 주요 지표")).toBeTruthy();
    expect(await screen.findByText("fixture-chain-1")).toBeTruthy();
    expect(screen.getByText("123456789.012345 GXN")).toBeTruthy();
    expect(screen.getByText("4.20%")).toBeTruthy();
  });
});
