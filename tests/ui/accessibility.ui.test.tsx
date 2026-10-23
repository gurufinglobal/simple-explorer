// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "../helpers/render";
import userEvent from "@testing-library/user-event";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TopNavSearch } from "@/components/search/top-nav-search";
import { ValidatorsTable } from "@/components/staking/validators-table";
import { QueryStatus } from "@/components/query/query-status";
import { initialResult } from "@/lib/query-result";
import Home from "@/app/page";
import OperationsPage from "@/app/(explorer)/operations/page";
const push = vi.fn();
const router = { push, prefetch: vi.fn() } as unknown as AppRouterInstance;
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify([{ key: "a", name: "Chain A", lcdUrl: "https://a.example", bech32Prefix: "guru" }]));
  window.history.replaceState(null, "", "/?chain=a");
  push.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.history.replaceState(null, "", "/"); });
it("keyboard search chooses an ambiguous height and closes errors back to the named input", async () => {
  const user = userEvent.setup();
  render(<AppRouterContext.Provider value={router}><TopNavSearch /></AppRouterContext.Provider>);
  const input = screen.getByRole("textbox", { name: "블록 높이 / Cosmos tx hash (hex) / 계정 주소" });
  await user.tab(); expect(document.activeElement).toBe(input);
  await user.type(input, "1".repeat(64)); await user.keyboard("{Enter}");
  expect(push).not.toHaveBeenCalled();
  await user.tab(); await user.tab(); await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "블록 높이 (정수)" }));
  await user.keyboard("{Enter}"); expect(push).toHaveBeenCalledWith(`/blocks/${"1".repeat(64)}?chain=a`);
  await user.clear(input); await user.type(input, "?"); await user.keyboard("{Enter}");
  expect(screen.getByRole("alert", { name: "검색 오류" }).textContent).toBeTruthy();
  await user.tab(); await user.tab(); await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(input); expect(screen.queryByRole("alert")).toBeNull();
});
it("validator links and original amount controls are separate keyboard targets inside a named scroll region", async () => {
  const user = userEvent.setup();
  render(<AppRouterContext.Provider value={router}><ValidatorsTable validators={[{ operatorAddress: "operator-long", moniker: "Validator One", votingPower: "100", bondDenom: "agxn", commission: "0.1", jailed: false, status: "BOND_STATUS_BONDED", details: "", website: "", identity: "", minSelfDelegation: "1", unbondingHeight: "0", unbondingTime: "" }]} /></AppRouterContext.Provider>);
  await user.tab(); expect(document.activeElement).toBe(screen.getByRole("region", { name: "검증자 목록 가로 스크롤" }));
  await user.tab(); expect(document.activeElement).toBe(screen.getByRole("link", { name: "Validator One" }));
  expect(document.activeElement?.getAttribute("href")).toBe("/staking/operator-long?chain=a");
  await user.tab(); await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "원본 금액" }).getAttribute("aria-expanded")).toBe("true");
  expect(push).not.toHaveBeenCalled();
});
it("loading and error have explicit accessible names", () => {
  const context = { chain: "a", target: "channels" };
  const view = render(<QueryStatus result={{ ...initialResult(context), status: "loading" }} />);
  expect(screen.getByRole("status", { name: "조회 상태" }).textContent).toBe("불러오는 중");
  view.rerender(<QueryStatus result={{ ...initialResult(context), status: "error", error: { kind: "network", message: "offline" } }} />);
  expect(screen.getByRole("alert", { name: "조회 오류" }).textContent).toContain("offline");
});
it("home explains wallet-free exploration and configured chains with no import example", () => {
  render(<AppRouterContext.Provider value={router}><Home /></AppRouterContext.Provider>);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gurufin 탐색기");
  expect(screen.getByText("공개 정보 조회에는 지갑 연결이 필요하지 않습니다.")).toBeTruthy();
  expect(screen.getByText("현재 설정된 체인: Chain A")).toBeTruthy();
  expect(document.querySelector("pre")).toBeNull();
});

it("IBC route announces pending HTTP then failure without a wallet or an execution confirmation", async () => {
  let finish!: (response: Response) => void;
  const http = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", http);
  render(<OperationsPage />);
  expect(screen.getByRole("status", { name: "조회 상태" }).textContent).toBe("불러오는 중");
  expect(screen.getByRole("heading", { name: "IBC 채널", level: 5 })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /최종 확인/ })).toBeNull();
  expect(http).toHaveBeenCalledOnce();
  await act(async () => finish(new Response("", { status: 503 })));
  expect((await screen.findByRole("alert", { name: "조회 오류" })).textContent).toContain("503");
  expect(screen.queryByRole("dialog")).toBeNull();
});
