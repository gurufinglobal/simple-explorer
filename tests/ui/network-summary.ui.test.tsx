// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "../helpers/render";
import { NetworkSummaryPanel } from "@/components/network/network-summary-panel";
import { mockNetworkSummaryHttp, restoreHttpBoundary } from "../helpers/network-summary";

beforeEach(() => { mockNetworkSummaryHttp(); });
afterEach(() => { cleanup(); restoreHttpBoundary(); });

describe("network summary DOM", () => {
  it("renders metrics obtained through the real service and HTTP client", async () => {
    render(<NetworkSummaryPanel />);
    expect(screen.getByText("체인 주요 지표")).toBeTruthy();
    expect(await screen.findByText("fixture-chain-1")).toBeTruthy();
    expect(screen.getByText("123456789.012345 GXN")).toBeTruthy();
    expect(screen.getByText("4.20%")).toBeTruthy();
  });
});
