// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erc20Abi } from "viem";
import userEvent from "@testing-library/user-event";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "../helpers/render";
import { evmChain, from, to, token, hash, receipt, setupEvm } from "../helpers/evm";
import { WalletView } from "@/components/wallet/wallet-view";
import { WalletPortfolioHydrator } from "@/components/wallet/wallet-portfolio-hydrator";
import { HeaderWalletMenu } from "@/components/wallet/header-wallet-menu";
import { useWalletSessionStore as wallet } from "@/stores/wallet-session.store";
import { useWalletPortfolioStore as portfolio } from "@/stores/wallet-portfolio.store";
import { useEvmResults, prepareEvmTransfer } from "@/services/evm/transfer";
import { mockQueryHttp, fixtureAddress } from "../helpers/query-http";
import { amountResponse } from "../helpers/amounts";
let env: ReturnType<typeof setupEvm>;
beforeEach(() => { window.history.replaceState(null, "", "/wallet"); env = setupEvm(); });
afterEach(() => { cleanup(); wallet.getState().disconnect(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const renderWallet = (locale: "en" | "ko" = "en") => render(<><WalletPortfolioHydrator /><WalletView /></>, { locale });
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const ready = () => screen.findByText("EVM · Ready for review");
const sends = () => env.walletRequest.mock.calls.filter(([args]) => args.method === "eth_sendTransaction");

describe("wallet page with real stores, services and forms", () => {
  it("shows reconnect guidance, connecting lock and a chain-preserving header entry", async () => {
    wallet.getState().disconnect();
    const view = renderWallet();
    expect(screen.getByText(/After a page reload/)).toBeVisible();
    expect(screen.queryByRole("tab")).toBeNull();
    act(() => { wallet.getState().startConnecting(); });
    expect(screen.getByRole("button", { name: "Connect Keplr" })).toBeDisabled();
    view.unmount();
    render(<HeaderWalletMenu />, { locale: "en" });
    fireEvent.click(screen.getByRole("button", { name: "Wallet menu" }));
    expect(screen.getByRole("menuitem", { name: "My wallet" })).toHaveAttribute("href", "/wallet?chain=evm");
    expect(sends()).toHaveLength(0);
  });
  it("reads exact native/ERC20 assets independently, retaining native on a token metadata failure", async () => {
    renderWallet(); await ready();
    expect(await screen.findByText("1000 SYN")).toBeVisible();
    fireEvent.change(screen.getByLabelText("ERC20 contract address"), { target: { value: token } });
    fireEvent.click(screen.getByRole("button", { name: "Query token" }));
    expect(await screen.findByText("900719925474099.312345 TOK")).toBeVisible();
    env.state.metadataFails = true;
    fireEvent.change(screen.getByLabelText("ERC20 contract address"), { target: { value: to } });
    fireEvent.click(screen.getByRole("button", { name: "Query token" }));
    await waitFor(() => expect(screen.queryByText("900719925474099.312345 TOK")).toBeNull());
    expect(screen.getByText("1000 SYN")).toBeVisible();
    expect(sends()).toHaveLength(0);
  });
  it("isolates account and chain, discarding delayed public reads from the previous account", async () => {
    renderWallet(); await ready(); await screen.findByText("1000 SYN");
    const original = env.http.getMockImplementation()!;
    let release!: () => void;
    env.http.mockImplementation(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return original(...args); });
    act(() => wallet.getState().connect("metamask", null, to, { chainKey: "evm" }));
    expect(screen.queryByText("1000 SYN")).toBeNull();
    await waitFor(() => expect(release).toBeTypeOf("function"));
    act(() => wallet.getState().connect("metamask", null, from, { chainKey: "different" }));
    await act(async () => { release(); });
    expect(screen.queryByText("1000 SYN")).toBeNull();
    expect(screen.getByText(/connected chain: different/)).toBeVisible();
    tab("Send"); expect(screen.getByText(/Sending is blocked/)).toBeVisible();
  });
  it.each(["wallet-chain", "rpc-chain", "no-config", "wc-no-approval"])("blocks %s before showing write controls", async failure => {
    if (failure === "wallet-chain") env.state.walletChain = "0x1";
    if (failure === "rpc-chain") env.state.chainId = "0x1";
    if (failure === "no-config") env = setupEvm({ ...evmChain, evm: undefined });
    if (failure === "wc-no-approval") wallet.getState().connect("walletconnect", null, from, { chainKey: "evm", wcMode: "evm", methods: [] });
    renderWallet();
    await waitFor(() => expect(screen.getByText("EVM · Read only")).toBeVisible());
    tab("Send"); expect(screen.queryByRole("button", { name: "Review transfer" })).toBeNull();
    tab("Contract");
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: token } });
    fireEvent.change(screen.getByLabelText("ABI JSON"), { target: { value: JSON.stringify(erc20Abi.filter(fn => fn.type === "function" && fn.name === "transfer")) } });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Function signature" }));
    fireEvent.click(screen.getByRole("option", { name: /transfer/ }));
    expect(screen.getByRole("button", { name: "Review contract write" })).toBeDisabled();
    expect(sends()).toHaveLength(0);
  });
  it.each(["en", "ko"] as const)("sends through the integrated %s tab and retains a successful result when balance refresh fails", async locale => {
    env.state.receipt = receipt();
    renderWallet(locale);
    await screen.findByText(locale === "en" ? "EVM · Ready for review" : "EVM · 거래 검토 가능");
    tab(locale === "en" ? "Send" : "전송");
    fireEvent.change(screen.getByLabelText(locale === "en" ? "Recipient EVM address" : "받는 EVM 주소"), { target: { value: to } });
    fireEvent.change(screen.getByLabelText(locale === "en" ? "Amount" : "수량"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Review transfer" : "전송 내용 확인" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: locale === "en" ? "Confirm and request wallet" : "확인 후 지갑 요청" }));
    await waitFor(() => expect(useEvmResults.getState().results[0]?.status).toBe("success"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    env.http.mockRejectedValue(new Error("read unavailable"));
    fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Retry Native asset" : "네이티브 자산 다시 조회" }));
    await waitFor(() => expect(screen.getByRole("status", { name: locale === "en" ? "Native asset query status" : "네이티브 자산 조회 상태" })).toHaveTextContent(locale === "en" ? "Refresh failed" : "갱신 실패"));
    tab(locale === "en" ? "Activity" : "활동");
    expect(await screen.findByText(hash)).toBeVisible();
    tab(locale === "en" ? "Assets" : "자산");
    expect(screen.getByText(hash)).toBeVisible(); expect(sends()).toHaveLength(1);
  });
  it("filters stored unknown results by chain and account and supports keyboard tabs/QR focus return", async () => {
    const snapshot = await prepareEvmTransfer({ recipient: to, amount: "1" });
    useEvmResults.setState({ results: [
      { id: "own", snapshot, hash, status: "unknown" },
      { id: "other", snapshot: { ...snapshot, from: to }, hash: `0x${"cd".repeat(32)}`, status: "unknown" },
    ] });
    renderWallet(); await ready();
    expect(screen.getByText(hash)).toBeVisible(); expect(screen.queryByText(`0x${"cd".repeat(32)}`)).toBeNull();
    const user = userEvent.setup();
    screen.getByRole("tab", { name: "Assets" }).focus();
    await user.keyboard("{ArrowRight}{Enter}");
    expect(screen.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
    const qrButton = screen.getByRole("button", { name: "EVM QR" });
    await user.click(qrButton); await screen.findByRole("dialog"); await user.keyboard("{Escape}");
    await waitFor(() => expect(qrButton).toHaveFocus());
    expect(sends()).toHaveLength(0);
  });
  it("retains Cosmos siblings in partial/stale states and keeps read-only send blocked", async () => {
    let failRewards = true;
    const http = mockQueryHttp(url => amountResponse(url) ?? (url.pathname.includes("/balances/") ? { balances: [{ denom: "agxn", amount: "1234567890123456789" }] }
      : url.pathname.endsWith("/rewards") ? failRewards ? new Response("", { status: 503 }) : { total: [] }
      : url.pathname.includes("/unbonding") ? { unbonding_responses: [] }
      : url.pathname.endsWith("/txs") ? new Response("", { status: 503 }) : { delegation_responses: [] }));
    wallet.getState().connect("keplr", fixtureAddress, null, { chainKey: "fixture" });
    renderWallet();
    await waitFor(() => expect(portfolio.getState().result.status).toBe("partial"));
    expect(screen.getAllByText("1.234567 GXN").length).toBeGreaterThan(0);
    failRewards = false;
    await act(() => portfolio.getState().refresh(fixtureAddress));
    expect(portfolio.getState().result.status).toBe("success");
    http.mockResolvedValue(new Response("", { status: 503 }));
    await act(() => portfolio.getState().refresh(fixtureAddress));
    expect(portfolio.getState().result.status).toBe("stale");
    expect(screen.getAllByText("1.234567 GXN").length).toBeGreaterThan(0);
    tab("Activity");
    await waitFor(() => expect(screen.getByText(/Only part of the sender/)).toBeVisible());
    expect(screen.queryByText(/No transactions in/)).toBeNull();
    tab("Send"); expect(screen.getByText(/Sending is blocked/)).toBeVisible();
  });
});
