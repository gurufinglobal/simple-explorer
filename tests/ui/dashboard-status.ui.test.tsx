// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardView } from "@/components/network/dashboard-view";
import { DashboardQueryInfo } from "@/components/network/dashboard-query-info";
import { initialResult, type QueryResult } from "@/lib/query-result";
import { setActiveChainKeyCookie } from "@/lib/chain-selection";
import { fixture, mockNetworkSummaryHttp, restoreHttpBoundary } from "../helpers/network-summary";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.cookie = "gf_chain=; max-age=0; path=/";
  restoreHttpBoundary();
});

function mockDashboard() {
  const http = mockNetworkSummaryHttp();
  const respond = http.getMockImplementation()!;
  http.mockImplementation((input, init) => String(input).includes("/validators?")
    ? Promise.resolve(Response.json({ validators: [{ operator_address: "validator", tokens: "1", description: { moniker: "Validator" } }] }))
    : respond(input, init));
  return http;
}

function info() { return screen.getByRole("region", { name: "Dashboard 조회 정보" }); }
async function ready() { expect(await screen.findByText("4/4개 조회 완료")).toBeVisible(); }

it("collapses successful reads, exposes exact per-card originals and observation details using keyboard", async () => {
  mockDashboard();
  render(<DashboardView />);
  await ready();
  expect(within(info()).queryByText("조회 완료")).toBeNull();
  expect(within(info()).queryByText(/dashboard-summary/)).toBeNull();
  const rawSupply = `${fixture.supply.amount.amount} agxn`;
  const rawBonded = `${fixture.pool.pool.bonded_tokens} agxn`;
  expect(screen.getByText(rawSupply)).not.toBeVisible();
  expect(screen.getByText(rawBonded)).not.toBeVisible();
  for (const [label, raw] of [["공급량", rawSupply], ["본딩량", rawBonded]]) {
    const button = screen.getByRole("button", { name: `${label} 원본` });
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(raw)).toBeVisible();
    expect(document.getElementById(button.getAttribute("aria-controls")!)).toContainElement(screen.getByText(raw));
    await userEvent.keyboard(" ");
    expect(screen.getByText(raw)).not.toBeVisible();
    expect(button).toHaveFocus();
  }
  const details = screen.getByRole("button", { name: "조회 정보" });
  details.focus();
  await userEvent.keyboard("{Enter}");
  expect(details).toHaveAttribute("aria-expanded", "true");
  expect(within(info()).getByText(/체인: fixture · 대상: dashboard-summary/)).toHaveTextContent(/데이터 관찰 시각: .*높이 3/);
  expect(within(info()).getAllByRole("button", { name: /다시 조회/ })).toHaveLength(4);
  await userEvent.keyboard(" ");
  expect(details).toHaveFocus();
  expect(details).toHaveAttribute("aria-expanded", "false");
  expect(within(info()).queryByText(/dashboard-summary/)).toBeNull();
});

it("keeps partial source failures outside closed details without hiding good metrics", async () => {
  const http = mockDashboard();
  const respond = http.getMockImplementation()!;
  http.mockImplementation((input, init) => String(input).endsWith("/inflation")
    ? Promise.resolve(new Response("", { status: 500 })) : respond(input, init));
  render(<DashboardView />);
  expect(await screen.findByText("일부 조회 실패")).toBeVisible();
  expect(within(info()).getByText("네트워크 지표")).toBeVisible();
  expect(within(info()).getByRole("alert")).toHaveTextContent("HTTP 500");
  expect(screen.getByText("3/4개 조회 완료")).toBeVisible();
  expect(screen.getByText("123456789.012345 GXN")).toBeVisible();
  expect(screen.getByRole("button", { name: "조회 정보" })).toHaveAttribute("aria-expanded", "false");
});

it("retries only one source, disables busy/backoff, preserves stale data and its observation time", async () => {
  const http = mockDashboard();
  const respond = http.getMockImplementation()!;
  render(<DashboardView />);
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "조회 정보" }));
  const timestamp = within(info()).getByText(/대상: accounts-total/).textContent;
  http.mockClear();
  http.mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "2" } }));
  await userEvent.click(screen.getByRole("button", { name: "계정 수 다시 조회" }));
  expect(await screen.findByText("갱신 실패: 마지막 조회 데이터")).toBeVisible();
  expect(http).toHaveBeenCalledTimes(1);
  expect(String(http.mock.calls[0][0])).toContain("/accounts?");
  expect(screen.getByText("9,007,199,254,740,993")).toBeVisible();
  expect(within(info()).getByText(/대상: accounts-total/).textContent).toBe(timestamp);
  const retry = screen.getByRole("button", { name: "계정 수 다시 조회" });
  expect(retry).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "조회 정보" }));
  expect(screen.getByText("갱신 실패: 마지막 조회 데이터")).toBeVisible();
  await waitFor(() => expect(retry).toBeEnabled(), { timeout: 4000 });
  let resolve!: (value: Response) => void;
  http.mockImplementation(() => new Promise(done => { resolve = done; }));
  await userEvent.click(retry);
  expect(retry).toBeDisabled();
  expect(screen.getByText("불러오는 중")).toBeVisible();
  fireEvent.click(retry);
  expect(http).toHaveBeenCalledTimes(2);
  await act(async () => resolve(await respond("https://lcd.example.test/cosmos/auth/v1beta1/accounts")));
  await ready();
  expect(within(info()).queryByRole("alert")).toBeNull();
});

it("exposes empty validators and initial account failure and recovers through their individual retries", async () => {
  const http = mockDashboard();
  const respond = http.getMockImplementation()!;
  http.mockImplementation((input, init) => String(input).includes("/validators?")
    ? Promise.resolve(Response.json({ validators: [] })) : String(input).includes("/accounts?")
      ? Promise.resolve(new Response("", { status: 503 })) : respond(input, init));
  render(<DashboardView />);
  expect(await screen.findByText("조회 완료: 빈 결과")).toBeVisible();
  expect(await screen.findByText("조회 실패")).toBeVisible();
  expect(within(info()).getByText("검증인")).toBeVisible();
  expect(within(info()).getByText("계정 수")).toBeVisible();
  expect(screen.getByText("2/4개 조회 완료")).toBeVisible();
  http.mockImplementation(respond);
  await userEvent.click(screen.getByRole("button", { name: "계정 수 다시 조회" }));
  expect(await screen.findByText("3/4개 조회 완료")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "검증인 다시 조회" }));
  await ready();
});

it("clears old chain metrics/originals and closes disclosures immediately on chain change", async () => {
  const http = mockDashboard();
  render(<DashboardView />);
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "공급량 원본" }));
  await userEvent.click(screen.getByRole("button", { name: "조회 정보" }));
  vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify([
    { key: "fixture", name: "Fixture", lcdUrl: "https://lcd.example.test", nativeDenom: "agxn", bondDenom: "agxn" },
    { key: "other", name: "Other", lcdUrl: "https://other.example.test", nativeDenom: "other" },
  ]));
  http.mockImplementation(() => new Promise(() => {}));
  act(() => setActiveChainKeyCookie("other"));
  expect(screen.queryByText(`${fixture.supply.amount.amount} agxn`)).toBeNull();
  expect(screen.queryByText("123456789.012345 GXN")).toBeNull();
  expect(screen.getByRole("button", { name: "공급량 원본" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("button", { name: "조회 정보" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("0/4개 조회 완료")).toBeVisible();
});

it.each([
  ["idle", "미조회"], ["loading", "불러오는 중"], ["not-found", "확인된 미존재"],
  ["unsupported", "미지원"], ["cancelled", "조회 취소"],
] as const)("keeps %s visible in collapsed query information", (status, label) => {
  const result: QueryResult<unknown> = { ...initialResult({ chain: "fixture", target: "source" }), status };
  render(<DashboardQueryInfo queries={[{ label: "대상", result }]} />);
  expect(screen.getByText(label)).toBeVisible();
  expect(screen.getByText("0/1개 조회 완료")).toBeVisible();
});
