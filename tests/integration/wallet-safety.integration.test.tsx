// @vitest-environment jsdom
import { amountResponse } from "../helpers/amounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { bech32 } from "bech32";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { SessionTypes } from "@walletconnect/types";
import type { ChainConfig } from "@/lib/env";
import { getConfiguredChains, parseChainConfigs } from "@/lib/env";
import { getActiveChainConfig, setActiveChainKeyCookie } from "@/lib/chain-selection";
import { useWalletSessionStore as store } from "@/stores/wallet-session.store";
import { useWalletPortfolioStore as portfolio } from "@/stores/wallet-portfolio.store";
import { attachWalletLifecycle, connectExtension, connectQr, disconnectWallet, refreshWriteEligibility } from "@/services/wallet/wallet-lifecycle";
import { normalizeWalletConnectSession } from "@/services/wallet/walletconnect-session";
import { resetWalletConnectClientForTests } from "@/services/wallet/walletconnect-client";
import { submitSendTx } from "@/services/guru/bank-tx.client";
import { submitDelegateTx, submitUndelegateTx, submitWithdrawDelegatorRewardTx, submitWithdrawValidatorCommissionTx } from "@/services/guru/staking-tx.client";
import { submitGovernanceVoteTx, submitGovernanceDepositTx, submitTextProposalTx } from "@/services/guru/governance-tx.client";
import { GovernanceNewProposalForm } from "@/components/governance/governance-new-proposal-form";
import { HeaderWalletMenu } from "@/components/wallet/header-wallet-menu";
import { ChainSelector } from "@/components/layout/chain-selector";
import { WalletPortfolioHydrator } from "@/components/wallet/wallet-portfolio-hydrator";

const boundary = vi.hoisted(() => ({
  connect: vi.fn(), disconnect: vi.fn(), request: vi.fn(), sessionGet: vi.fn(),
  on: vi.fn(), off: vi.fn(), connectSigner: vi.fn(), broadcast: vi.fn(), close: vi.fn(),
}));
vi.mock("@walletconnect/sign-client", () => ({ default: { init: async () => ({
  connect: boundary.connect, disconnect: boundary.disconnect, request: boundary.request,
  session: { get: boundary.sessionGet }, on: boundary.on, off: boundary.off,
}) } }));
vi.mock("@cosmjs/stargate", async original => ({
  ...await original<typeof import("@cosmjs/stargate")>(),
  SigningStargateClient: { connectWithSigner: boundary.connectSigner },
}));
const address = bech32.encode("guru", bech32.toWords(new Uint8Array(20).fill(1)));
const addressB = bech32.encode("guru", bech32.toWords(new Uint8Array(20).fill(2)));
const pubkey = new Uint8Array(33).fill(3);
const a: ChainConfig = {
  key: "a", name: "Chain A", chainId: "a-1", lcdUrl: "https://a.test:1317", rpcUrl: "https://a.test:26657",
  bech32Prefix: "guru", denom: "agxn", nativeDenom: "agxn", bondDenom: "agxn", feeDenom: "agxn", decimals: 18,
  signing: [{ wallet: "keplr", method: "direct", evidence: "synthetic wallet boundary" }, { wallet: "walletconnect", method: "amino", evidence: "synthetic wallet boundary" }],
  rpcAccess: { origin: "http://localhost:3000", get: true, post: true, options: true, observedAt: "2026-10-20", evidence: "synthetic browser boundary" },
};
const b = { ...a, key: "b", name: "Chain B", chainId: "b-1", lcdUrl: "https://b.test:1317", rpcUrl: "https://b.test:26657" };
const base = { walletType: "keplr" as const, sessionTopic: null, bech32Address: address };
let http: ReturnType<typeof vi.fn<typeof fetch>>;
let sign: ReturnType<typeof vi.fn>;
let detach: (() => void) | undefined;
function configure(chains: ChainConfig[] = [a, b]) {
  vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify(chains));
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "a");
}
function session(accounts = [`cosmos:a-1:${address}`], methods = ["cosmos_signAmino"]): SessionTypes.Struct {
  return { topic: "topic", expiry: Math.floor(Date.now() / 1000) + 600, namespaces: { cosmos: { accounts, methods, events: [] } } } as unknown as SessionTypes.Struct;
}
function connected(wallet: "keplr" | "walletconnect" = "keplr") {
  store.getState().connect(wallet, address, null, { chainKey: "a", chainId: "a-1", pubkey,
    sessionTopic: wallet === "walletconnect" ? "topic" : null, methods: ["cosmos_signAmino"] });
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function response(input: string) {
  const url = new URL(input); const chainId = url.hostname === "b.test" ? "b-1" : "a-1";
  if (amountResponse(url)) return amountResponse(url);
  if (url.pathname.includes("node_info")) return { default_node_info: { network: chainId } };
  if (url.port === "26657") return { result: { node_info: { network: chainId } } };
  if (url.pathname.includes("/auth/")) return { account: { pub_key: { key: Buffer.from(pubkey).toString("base64") } } };
  return { balances: [{ denom: "agxn", amount: "1000000000000000000" }], total: [], delegation_responses: [], unbonding_responses: [] };
}
beforeEach(() => {
  vi.clearAllMocks(); configure(); vi.stubEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "test-project");
  document.cookie = "gf_chain=; max-age=0; path=/";
  resetWalletConnectClientForTests(); store.getState().disconnect();
  http = vi.fn<typeof fetch>(async input => Response.json(response(String(input)))); vi.stubGlobal("fetch", http);
  sign = vi.fn().mockResolvedValue({ signed: { chainId: "a-1", bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), accountNumber: BigInt(0) }, signature: { pub_key: { type: "tendermint/PubKeySecp256k1", value: Buffer.from(pubkey).toString("base64") }, signature: "" } });
  window.keplr = { enable: vi.fn().mockResolvedValue(undefined) };
  window.getOfflineSigner = vi.fn(() => ({ getAccounts: async () => [{ address, pubkey, algo: "secp256k1" }], signDirect: sign }));
  boundary.request.mockImplementation(async args => ({ signed: args.request.params.signDoc, signature: {} }));
  boundary.broadcast.mockResolvedValue({ code: 0, transactionHash: "TX" });
  boundary.disconnect.mockResolvedValue(undefined); boundary.sessionGet.mockReturnValue(session());
  boundary.connectSigner.mockImplementation(async (_rpc: string, signer: OfflineSigner) => ({
    sign: async () => {
      if ("signDirect" in signer) await signer.signDirect(address, { chainId: "a-1", bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), accountNumber: BigInt(0) });
      else await signer.signAmino(address, { chain_id: "a-1", account_number: "0", sequence: "0", fee: { amount: [], gas: "1" }, msgs: [], memo: "" });
      return { bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), signatures: [] };
    }, broadcastTx: boundary.broadcast, disconnect: boundary.close,
  }));
});
afterEach(() => { cleanup(); detach?.(); detach = undefined; store.getState().disconnect(); delete window.keplr; delete window.getOfflineSigner; delete window.ethereum; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const send = () => submitSendTx({ ...base, toAddress: addressB, amount: "1", denom: "agxn" });
describe("W03 chain configuration and signing boundaries", () => {
  it.each(["{", "[]", '[{"key":"a"}]'])("rejects invalid config without default fallback: %s", raw => {
    vi.stubEnv("NEXT_PUBLIC_CHAINS", raw); expect(() => getConfiguredChains()).toThrow();
  });
  it("rejects duplicate keys and non HTTP endpoints", () => {
    expect(() => parseChainConfigs(JSON.stringify([a, a]))).toThrow("중복");
    expect(() => parseChainConfigs(JSON.stringify([{ ...a, rpcUrl: "file:///tmp/test" }]))).toThrow("HTTP");
  });
  it("does not silently replace invalid default or cookie", () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", "missing"); expect(() => getActiveChainConfig()).toThrow();
    setActiveChainKeyCookie("b"); expect(getActiveChainConfig().key).toBe("b");
    document.cookie = "gf_chain=missing; path=/"; expect(() => getActiveChainConfig()).toThrow();
  });
  it("new browser uses the displayed default for the actual connection request", async () => {
    render(<ChainSelector />); await connectExtension("keplr");
    expect(screen.getByRole("combobox").textContent).toContain("Chain A");
    expect(String(http.mock.calls[0][0])).toContain("https://a.test:1317/");
    expect(store.getState().chainId).toBe("a-1");
  });
  it("updates observed tgxn metadata without inventing fee/prefix/wallet support", () => {
    const [chain] = parseChainConfigs(JSON.stringify([{ key: "tgxn", name: "tgxn", lcdUrl: "https://tgxn.gurufin.io:1317", denom: "atgxn" }]));
    expect(chain).toMatchObject({ chainId: "guru_631-1", rpcUrl: "https://tgxn.gurufin.io:26657", denom: "agxn", nativeDenom: "agxn", bondDenom: "agxn" });
    expect(chain.feeDenom).toBeUndefined(); expect(chain.bech32Prefix).toBeUndefined(); expect(chain.signing).toBeUndefined();
  });
  it.each(["get", "post"])("LCD A / RPC B (%s) makes zero signer and broadcast calls", async method => {
    connected();
    http.mockImplementation(async (input, init) => Response.json(String(input).includes(":26657") && ((method === "post") === (init?.method === "POST")) ? { result: { node_info: { network: "b-1" } } } : response(String(input))));
    await expect(send()).rejects.toThrow("chain ID");
    expect(sign).not.toHaveBeenCalled(); expect(boundary.connectSigner).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it("a valid scoped signer reaches broadcast through the real transaction service", async () => {
    connected(); await expect(send()).resolves.toEqual({ txHash: "TX" }); expect(sign).toHaveBeenCalledTimes(1); expect(boundary.broadcast).toHaveBeenCalledTimes(1);
  });
  it("rejects an actual signer different from the displayed account", async () => {
    connected(); window.getOfflineSigner = () => ({ getAccounts: async () => [{ address: addressB, pubkey }] });
    await expect(send()).rejects.toThrow("실제 signer"); expect(sign).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it("disconnect while wallet signature is pending prevents broadcast", async () => {
    connected(); const pending = deferred<unknown>(); sign.mockReturnValue(pending.promise);
    const result = send(); await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
    store.getState().disconnect(); pending.resolve({});
    await expect(result).rejects.toThrow("변경"); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it.each([
    ["RPC 없음", { rpcUrl: undefined }, "RPC endpoint"],
    ["origin 미확인", { rpcAccess: undefined }, "origin"],
    ["fee 미확인", { feeDenom: undefined }, "denom"],
    ["서명 미확인", { signing: undefined }, "서명 방식"],
  ] as const)("%s keeps LCD portfolio readable and blocks writes", async (_name, override, reason) => {
    configure([{ ...a, ...override }]); connected();
    await refreshWriteEligibility(); await portfolio.getState().refresh(address);
    expect(portfolio.getState().balance).toBe("1 GXN"); expect(store.getState().writeReason).toContain(reason);
    await expect(send()).rejects.toThrow(reason); expect(sign).not.toHaveBeenCalled();
  });
  it("RPC failure retains connected read-only session with a reason", async () => {
    connected(); http.mockImplementation(async input => { if (String(input).includes(":26657")) throw new TypeError("CORS"); return Response.json(response(String(input))); });
    await refreshWriteEligibility(); expect(store.getState()).toMatchObject({ status: "connected", writeStatus: "blocked" }); expect(store.getState().writeReason).toBeTruthy();
  });
  it.each([
    () => submitDelegateTx({ ...base, validatorAddress: addressB, amount: "1", denom: "agxn" }),
    () => submitUndelegateTx({ ...base, validatorAddress: addressB, amount: "1", denom: "agxn" }),
    () => submitWithdrawDelegatorRewardTx({ ...base, validatorAddress: addressB }),
    () => submitWithdrawValidatorCommissionTx({ ...base, validatorAddress: addressB }),
    () => submitGovernanceVoteTx({ ...base, proposalId: "1", option: "yes" }),
    () => submitGovernanceDepositTx({ ...base, proposalId: "1", amount: "1", denom: "agxn" }),
    () => submitTextProposalTx({ ...base, title: "test", summary: "test", description: "test", initialDepositAmount: "1", denom: "agxn" }),
  ])("every existing transaction entry rejects a disconnected session before signing", async submit => {
    await expect(submit()).rejects.toThrow(); expect(sign).not.toHaveBeenCalled(); expect(boundary.connectSigner).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
});

describe("W03 connection and session lifecycle", () => {
  it("CAIP chain selection is independent of account array order", () => {
    const accounts = [`cosmos:b-1:${addressB}`, `cosmos:a-1:${address}`];
    expect(normalizeWalletConnectSession(session(accounts), a).bech32Address).toBe(address);
    expect(normalizeWalletConnectSession(session(accounts.reverse()), a).bech32Address).toBe(address);
  });
  it("WC B-only approval cannot connect/sign A", async () => {
    boundary.connect.mockResolvedValue({ approval: async () => session([`cosmos:b-1:${addressB}`]) });
    await connectQr(() => {}); expect(store.getState().status).toBe("error");
    await expect(send()).rejects.toThrow(); expect(boundary.request).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it("rechecks live namespace before using the WC signer", async () => {
    connected("walletconnect"); boundary.sessionGet.mockReturnValue(session([`cosmos:b-1:${addressB}`]));
    await expect(submitSendTx({ ...base, walletType: "walletconnect", sessionTopic: "topic", toAddress: addressB, amount: "1", denom: "agxn" })).rejects.toThrow("승인");
    expect(boundary.request).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it("missing amino approval leaves the selected account read-only", async () => {
    boundary.connect.mockResolvedValue({ approval: async () => session(undefined, []) });
    boundary.sessionGet.mockReturnValue(session(undefined, []));
    await connectQr(() => {}); expect(store.getState().writeReason).toContain("승인"); expect(boundary.request).not.toHaveBeenCalled();
  });
  it("empty accounts never report connected", async () => {
    window.getOfflineSigner = () => ({ getAccounts: async () => [] }); await connectExtension("keplr");
    expect(store.getState()).toMatchObject({ status: "error", bech32Address: null, writeStatus: "blocked" });
  });
  it("missing public key preserves read access with a reconnect reason", async () => {
    window.getOfflineSigner = () => ({ getAccounts: async () => [{ address }] }); await connectExtension("keplr");
    expect(store.getState()).toMatchObject({ status: "connected", writeStatus: "blocked" }); expect(store.getState().writeReason).toContain("공개키");
  });
  it("deduplicates simultaneous connections and ignores approval after disconnect", async () => {
    const pending = deferred<void>(); window.keplr!.enable = vi.fn(() => pending.promise);
    const first = connectExtension("keplr"); const second = connectExtension("keplr");
    await waitFor(() => expect(window.keplr!.enable).toHaveBeenCalledTimes(1));
    await disconnectWallet(); pending.resolve(); await Promise.all([first, second]);
    expect(store.getState().status).toBe("disconnected");
  });
  it("QR cancel ignores late approval and disconnects its remote session", async () => {
    const approval = deferred<SessionTypes.Struct>(); boundary.connect.mockResolvedValue({ uri: "wc:test", approval: () => approval.promise });
    const uri = vi.fn(); const pending = connectQr(uri); await waitFor(() => expect(uri).toHaveBeenCalled());
    await disconnectWallet(); approval.resolve(session()); await pending;
    expect(store.getState().status).toBe("disconnected"); expect(boundary.disconnect).toHaveBeenCalledWith(expect.objectContaining({ topic: "topic" }));
  });
  it("chain change while LCD is delayed cannot resurrect the old connection", async () => {
    detach = attachWalletLifecycle(); const pending = deferred<Response>(); http.mockReturnValueOnce(pending.promise);
    const old = connectExtension("keplr"); setActiveChainKeyCookie("b");
    pending.resolve(Response.json({ default_node_info: { network: "a-1" } })); await old;
    expect(store.getState().status).toBe("disconnected"); await connectExtension("keplr"); expect(store.getState().chainKey).toBe("b");
  });
  it.each(["session_update", "session_delete", "session_expire"])("%s invalidates account and buttons and cleans listeners", async event => {
    connected("walletconnect"); detach = attachWalletLifecycle();
    await waitFor(() => expect(boundary.on).toHaveBeenCalledWith(event, expect.any(Function)));
    boundary.on.mock.calls.find(([name]) => name === event)![1]({ topic: "topic" });
    expect(store.getState()).toMatchObject({ status: "error", bech32Address: null, writeStatus: "blocked" });
    detach(); detach = undefined; expect(boundary.off).toHaveBeenCalledWith(event, expect.any(Function));
  });
  it("Keplr account change immediately clears assets and requires reconnect", async () => {
    detach = attachWalletLifecycle(); connected(); await portfolio.getState().refresh(address);
    window.dispatchEvent(new Event("keplr_keystorechange"));
    expect(store.getState().bech32Address).toBeNull(); expect(portfolio.getState().balance).toBe("—");
    await connectExtension("keplr"); expect(store.getState().status).toBe("connected");
  });
  it.each(["accountsChanged", "chainChanged", "disconnect"])("MetaMask %s clears the read-only account and removes listeners", async event => {
    const on = vi.fn(); const removeListener = vi.fn();
    window.ethereum = { on, removeListener, request: vi.fn().mockResolvedValue([`0x${"1".repeat(40)}`]) };
    detach = attachWalletLifecycle(); await connectExtension("metamask"); expect(store.getState().writeReason).toContain("조회 전용");
    on.mock.calls.find(([name]) => name === event)![1]([]); expect(store.getState().evmAddress).toBeNull();
    detach(); detach = undefined; expect(removeListener).toHaveBeenCalledWith(event, expect.any(Function));
  });
  it.each(["disconnect", "switch"])("late A portfolio after %s is not rendered", async action => {
    const pending: ReturnType<typeof deferred<Response>>[] = [];
    http.mockImplementation(input => { if (String(input).startsWith("https://a.test")) { const p = deferred<Response>(); pending.push(p); return p.promise; } return Promise.resolve(Response.json(response(String(input)))); });
    function Assets() { const data = portfolio(); return <span data-testid="balance">{data.balance}</span>; }
    render(<><HeaderWalletMenu /><WalletPortfolioHydrator /><Assets /></>);
    act(() => connected()); await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    act(() => { if (action === "switch") { setActiveChainKeyCookie("b"); store.getState().connect("keplr", addressB, null, { chainKey: "b", chainId: "b-1" }); } else store.getState().disconnect(); });
    await act(async () => { pending.forEach(p => p.resolve(Response.json(response("https://a.test:1317/balances/")))); });
    expect(portfolio.getState().result.context.chain).not.toBe("a");
    if (action === "disconnect") expect(screen.getByTestId("balance").textContent).toBe("—");
    else expect(portfolio.getState().result.context.target).toBe(`portfolio:${addressB}`);
  });
  it("write button follows endpoint verification and invalidation", async () => {
    render(<><HeaderWalletMenu /><GovernanceNewProposalForm defaultDenom="agxn" /></>);
    const button = screen.getByRole("button", { name: "제안 전송" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await act(async () => { await connectExtension("keplr"); });
    fireEvent.change(screen.getByLabelText("초기 예치 (표시 단위)"), { target: { value: "1" } });
    await screen.findByText(/전송 원본 1000000000000000000 agxn/);
    fireEvent.click(screen.getByRole("checkbox", { name: "표시 수량과 전송 원본을 확인했습니다" }));
    expect(button.disabled).toBe(false);
    act(() => window.dispatchEvent(new Event("keplr_keystorechange")));
    expect(button.disabled).toBe(true);
  });
  it("WC approved A uses the scoped amino request", async () => {
    connected("walletconnect");
    await submitSendTx({ ...base, walletType: "walletconnect", sessionTopic: "topic", toAddress: addressB, amount: "1", denom: "agxn" });
    expect(boundary.request).toHaveBeenCalledWith(expect.objectContaining({ topic: "topic", chainId: "cosmos:a-1", request: expect.objectContaining({ method: "cosmos_signAmino" }) }));
    expect(boundary.broadcast).toHaveBeenCalledTimes(1);
  });
  it("two accounts for the same CAIP chain require explicit wallet selection", () => {
    expect(() => normalizeWalletConnectSession(session([`cosmos:a-1:${address}`, `cosmos:a-1:${addressB}`]), a)).toThrow("여러 개");
  });
  it("expired WC session cannot sign even when no expiry event arrived", async () => {
    connected("walletconnect"); boundary.sessionGet.mockReturnValue({ ...session(), expiry: 1 });
    await expect(submitSendTx({ ...base, walletType: "walletconnect", sessionTopic: "topic", toAddress: addressB, amount: "1", denom: "agxn" })).rejects.toThrow("만료");
    expect(boundary.request).not.toHaveBeenCalled(); expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it("selector preserves an invalid saved key and lets the user explicitly recover", () => {
    document.cookie = "gf_chain=missing; path=/";
    render(<ChainSelector />); expect(screen.getByRole("alert").textContent).toContain("설정이 없습니다");
    fireEvent.mouseDown(screen.getByRole("combobox")); fireEvent.click(screen.getByRole("option", { name: "Chain B" }));
    expect(getActiveChainConfig().key).toBe("b"); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("malformed cookie can be replaced by an explicit selection", () => {
    document.cookie = "gf_chain=%; path=/";
    render(<ChainSelector />); expect(screen.getByRole("alert").textContent).toContain("읽을 수 없습니다");
    fireEvent.mouseDown(screen.getByRole("combobox")); fireEvent.click(screen.getByRole("option", { name: "Chain A" }));
    expect(getActiveChainConfig().key).toBe("a"); expect(screen.queryByRole("alert")).toBeNull();
  });
  it.each(["base_account", "base_vesting_account", "missing"])("WC handles %s public key response without inventing a key", async shape => {
    boundary.connect.mockResolvedValue({ approval: async () => session() });
    const baseAccount = { pub_key: { key: Buffer.from(pubkey).toString("base64") } };
    const account = shape === "base_account" ? { base_account: baseAccount } : shape === "base_vesting_account" ? { base_vesting_account: { base_account: baseAccount } } : {};
    http.mockImplementation(async input => Response.json(String(input).includes("/auth/") ? { account } : response(String(input))));
    await connectQr(() => {});
    expect(store.getState().status).toBe("connected");
    expect(store.getState().writeStatus).toBe(shape === "missing" ? "blocked" : "ready");
    if (shape === "missing") expect(store.getState().writeReason).toContain("공개키");
  });
  it("malformed JSON is visible without requesting a fallback endpoint", () => {
    vi.stubEnv("NEXT_PUBLIC_CHAINS", "{"); render(<ChainSelector />);
    expect(screen.getByRole("alert").textContent).toContain("JSON"); expect(http).not.toHaveBeenCalled();
  });
  it("actual header exposes cancellation and blocks duplicate connect buttons", async () => {
    const pending = deferred<void>(); window.keplr!.enable = () => pending.promise;
    render(<HeaderWalletMenu />); fireEvent.click(screen.getByLabelText("wallet menu")); fireEvent.click(screen.getByText("Keplr"));
    await waitFor(() => expect(store.getState().status).toBe("connecting"));
    fireEvent.click(screen.getByLabelText("wallet menu"));
    expect(screen.getByText("Keplr").closest('[role="menuitem"]')?.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByText("Cancel connection")); await act(async () => { pending.resolve(); });
    expect(store.getState().status).toBe("disconnected"); expect(screen.getByText("Disconnected")).toBeTruthy();
  });
});

describe("W03 pending WalletConnect session invalidation", () => {
  function invalidateLiveSession(change: string) {
    if (change === "session_delete") boundary.sessionGet.mockImplementation(() => { throw new Error("No matching key"); });
    else if (change === "session_expire") boundary.sessionGet.mockReturnValue({ ...session(), expiry: 1 });
    else if (change === "approval_removed") boundary.sessionGet.mockReturnValue(session(undefined, []));
    else boundary.sessionGet.mockReturnValue(session([`cosmos:a-1:${addressB}`]));
  }
  async function expectInvalidated() {
    expect(store.getState()).toMatchObject({ status: "error", bech32Address: null, sessionTopic: null, pubkey: null, writeStatus: "blocked" });
    expect(store.getState().writeReason).toContain("다시 연결");
    expect(screen.getByText("Error")).toBeTruthy();
    expect(portfolio.getState()).toMatchObject({ balance: "—", staking: "—", reward: "—", unbonding: "—" });
    expect(portfolio.getState().result.data).toBeNull();
    expect((screen.getByRole("button", { name: "제안 전송" }) as HTMLButtonElement).disabled).toBe(true);
    await expect(submitSendTx({ ...base, walletType: "walletconnect", sessionTopic: "topic", toAddress: addressB, amount: "1", denom: "agxn" })).rejects.toThrow();
    expect(boundary.request).not.toHaveBeenCalled();
    expect(boundary.broadcast).not.toHaveBeenCalled();
  }
  it.each(["session_update", "session_delete", "session_expire"])("%s during public key lookup clears the pending approval and allows explicit reconnect", async event => {
    render(<><HeaderWalletMenu /><GovernanceNewProposalForm defaultDenom="agxn" /></>);
    await waitFor(() => expect(boundary.on).toHaveBeenCalledWith(event, expect.any(Function)));
    await act(async () => { await portfolio.getState().refresh(address); });
    expect(portfolio.getState().balance).toBe("1 GXN");
    const pendingKey = deferred<Response>();
    http.mockImplementation(async input => String(input).includes("/auth/") ? pendingKey.promise.then(value => value.clone()) : Response.json(response(String(input))));
    boundary.connect.mockResolvedValue({ approval: async () => session() });
    let pending!: Promise<void>;
    act(() => { pending = connectQr(() => {}); });
    await waitFor(() => expect(http.mock.calls.some(([url]) => String(url).includes("/auth/"))).toBe(true));
    const generation = store.getState().generation;
    expect(store.getState().status).toBe("connecting");
    invalidateLiveSession(event);
    act(() => boundary.on.mock.calls.find(([name]) => name === event)![1]({ topic: "topic" }));
    expect(store.getState().generation).toBeGreaterThan(generation);
    await expectInvalidated();
    await act(async () => {
      pendingKey.resolve(Response.json(response("https://a.test:1317/cosmos/auth/v1beta1/accounts/test")));
      await pending;
    });
    await expectInvalidated();
    const next = { ...session([`cosmos:a-1:${addressB}`]), topic: "next-topic" };
    boundary.sessionGet.mockReturnValue(next);
    boundary.connect.mockResolvedValue({ approval: async () => next });
    await act(async () => { await connectQr(() => {}); });
    expect(store.getState()).toMatchObject({ status: "connected", bech32Address: addressB, sessionTopic: "next-topic", writeStatus: "ready" });
    expect((screen.getByRole("button", { name: "제안 전송" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("초기 예치 (표시 단위)"), { target: { value: "1" } });
    await screen.findByText(/전송 원본 1000000000000000000 agxn/);
    fireEvent.click(screen.getByRole("checkbox", { name: "표시 수량과 전송 원본을 확인했습니다" }));
    expect((screen.getByRole("button", { name: "제안 전송" }) as HTMLButtonElement).disabled).toBe(false);
    expect(boundary.request).not.toHaveBeenCalled();
    expect(boundary.broadcast).not.toHaveBeenCalled();
  });
  it.each(["session_update", "session_delete", "session_expire", "approval_removed"])("rechecks %s after public key lookup even without an SDK event", async change => {
    render(<><HeaderWalletMenu /><GovernanceNewProposalForm defaultDenom="agxn" /></>);
    const pendingKey = deferred<Response>();
    http.mockImplementation(async input => String(input).includes("/auth/") ? pendingKey.promise.then(value => value.clone()) : Response.json(response(String(input))));
    boundary.connect.mockResolvedValue({ approval: async () => session() });
    let pending!: Promise<void>;
    act(() => { pending = connectQr(() => {}); });
    await waitFor(() => expect(http.mock.calls.some(([url]) => String(url).includes("/auth/"))).toBe(true));
    invalidateLiveSession(change);
    await act(async () => {
      pendingKey.resolve(Response.json(response("https://a.test:1317/cosmos/auth/v1beta1/accounts/test")));
      await pending;
    });
    await expectInvalidated();
  });
  it.each(["session_update", "session_delete", "session_expire", "approval_removed"])("rechecks %s after endpoint verification before enabling writes", async change => {
    render(<><HeaderWalletMenu /><GovernanceNewProposalForm defaultDenom="agxn" /></>);
    const pendingRpc = deferred<Response>();
    http.mockImplementation(async input => String(input).includes(":26657") ? pendingRpc.promise.then(value => value.clone()) : Response.json(response(String(input))));
    act(() => connected("walletconnect"));
    let pending!: Promise<void>;
    act(() => { pending = refreshWriteEligibility(); });
    await waitFor(() => expect(http.mock.calls.some(([url]) => String(url).includes(":26657"))).toBe(true));
    invalidateLiveSession(change);
    await act(async () => {
      pendingRpc.resolve(Response.json(response("https://a.test:26657/status")));
      await pending;
    });
    await expectInvalidated();
  });
  it("finishing an old approval cannot clear a newer pending topic or invalidate it with an unrelated event", async () => {
    render(<><HeaderWalletMenu /><GovernanceNewProposalForm defaultDenom="agxn" /></>);
    await waitFor(() => expect(boundary.on).toHaveBeenCalledWith("session_delete", expect.any(Function)));
    const onDelete = boundary.on.mock.calls.find(([name]) => name === "session_delete")![1];
    const oldKey = deferred<Response>(); const newKey = deferred<Response>();
    http.mockImplementation(async input => {
      const url = String(input);
      if (url.includes("/auth/")) return (url.includes(addressB) ? newKey.promise : oldKey.promise).then(value => value.clone());
      return Response.json(response(url));
    });
    boundary.connect.mockResolvedValue({ approval: async () => session() });
    let old!: Promise<void>; let current!: Promise<void>;
    act(() => { old = connectQr(() => {}); });
    await waitFor(() => expect(http.mock.calls.some(([url]) => String(url).includes(`/accounts/${address}`))).toBe(true));
    act(() => onDelete({ topic: "topic" }));
    const next = { ...session([`cosmos:a-1:${addressB}`]), topic: "next-topic" };
    boundary.sessionGet.mockReturnValue(next);
    boundary.connect.mockResolvedValue({ approval: async () => next });
    act(() => { current = connectQr(() => {}); });
    await waitFor(() => expect(http.mock.calls.some(([url]) => String(url).includes(`/accounts/${addressB}`))).toBe(true));
    const generation = store.getState().generation;
    await act(async () => {
      oldKey.resolve(Response.json(response("https://a.test:1317/cosmos/auth/v1beta1/accounts/test")));
      await old;
    });
    act(() => onDelete({ topic: "topic" }));
    expect(store.getState()).toMatchObject({ status: "connecting", generation });
    act(() => onDelete({ topic: "next-topic" }));
    await expectInvalidated();
    await act(async () => {
      newKey.resolve(Response.json(response("https://a.test:1317/cosmos/auth/v1beta1/accounts/test")));
      await current;
    });
    await expectInvalidated();
  });
});
