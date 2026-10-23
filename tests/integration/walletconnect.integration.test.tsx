// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionTypes } from "@walletconnect/types";
import { cleanup, fireEvent, render, screen, waitFor } from "../helpers/render";
import { cosmosAddress, cosmosPubkey, cosmosSigningProfile } from "../helpers/cosmos-signing";
import type { ChainConfig } from "@/lib/env";
import { attachWalletLifecycle, connectQr, disconnectWallet, WALLETCONNECT_PAIRING_TIMEOUT_MS } from "@/services/wallet/wallet-lifecycle";
import { resetWalletConnectClientForTests } from "@/services/wallet/walletconnect-client";
import { createWalletConnectEvmProvider } from "@/services/wallet/walletconnect-evm-provider";
import { createWalletConnectOfflineSigner } from "@/services/wallet/walletconnect-cosmos-signer";
import { assertWalletConnectRequest, normalizeWalletConnectSession } from "@/services/wallet/walletconnect-session";
import { walletConnectMobileLink } from "@/services/wallet/walletconnect-mobile";
import { HeaderWalletMenu } from "@/components/wallet/header-wallet-menu";
import { WalletConnectQrDialog } from "@/components/wallet/walletconnect-qr-dialog";
import { useWalletSessionStore as store } from "@/stores/wallet-session.store";
import type { WalletConnectMode } from "@/types/walletconnect";
const sdk = vi.hoisted(() => ({ connect: vi.fn(), request: vi.fn(), disconnect: vi.fn(), get: vi.fn(), on: vi.fn(), off: vi.fn() }));
vi.mock("@walletconnect/sign-client", () => ({ default: { init: async () => ({ ...sdk, session: { get: sdk.get } }) } }));
const evm = `0x${"12".repeat(20)}`;
const other = `0x${"34".repeat(20)}`;
const chain: ChainConfig = {
  key: "wc", name: "WC test", chainId: "test-1", evmChainId: "631", lcdUrl: "https://lcd.test", rpcUrl: "https://rpc.test",
  bech32Prefix: "guru", nativeDenom: "agxn", bondDenom: "agxn", feeDenom: "agxn", decimals: 18,
  signingProfile: cosmosSigningProfile, signing: [{ wallet: "walletconnect", method: "amino", evidence: "synthetic" }],
  rpcAccess: { origin: "http://localhost:3000", get: true, post: true, options: true, observedAt: "2026-10-23", evidence: "synthetic" },
};
const uri = `wc:${"a".repeat(64)}@2?relay-protocol=irn&symKey=${"b".repeat(64)}`;
function session(mode: WalletConnectMode = "evm"): SessionTypes.Struct {
  return { topic: "selected-topic", expiry: Math.floor(Date.now() / 1000) + 600, namespaces: {
    [mode === "evm" ? "eip155" : "cosmos"]: {
      accounts: [mode === "evm" ? `eip155:631:${evm}` : `cosmos:test-1:${cosmosAddress}`],
      methods: mode === "evm" ? ["eth_sendTransaction"] : mode === "keplr" ? ["keplr_getKey", "keplr_signAmino"] : ["cosmos_signAmino"],
      events: mode === "evm" ? ["accountsChanged", "chainChanged"] : [],
    },
  } } as unknown as SessionTypes.Struct;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function configure(value = chain) {
  vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify([value])); vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", value.key);
}
function approve(mode: WalletConnectMode = "evm", value = session(mode)) {
  sdk.get.mockReturnValue(value); sdk.connect.mockResolvedValue({ uri, approval: async () => value });
}
let detach: (() => void) | undefined;
let http: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); configure(); vi.stubEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "synthetic-project");
  document.cookie = "gf_chain=; max-age=0; path=/";
  resetWalletConnectClientForTests(); store.getState().disconnect(); approve();
  sdk.disconnect.mockResolvedValue(undefined); sdk.request.mockResolvedValue("0xhash");
  http = vi.fn(async (input: unknown) => Response.json(String(input).includes("/auth/") ? {
    account: { "@type": cosmosSigningProfile.accountTypeUrl, address: cosmosAddress, pub_key: { "@type": cosmosSigningProfile.pubkeyTypeUrl, key: Buffer.from(cosmosPubkey).toString("base64") } },
  } : String(input).includes("lcd.test") ? { default_node_info: { network: "test-1" } } : { result: { node_info: { network: "test-1" } } }));
  vi.stubGlobal("fetch", http);
});
afterEach(() => { cleanup(); detach?.(); detach = undefined; store.getState().disconnect(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("W04 namespace grants and EVM request boundary", () => {
  it.each(["evm", "cosmos", "keplr"] as const)("connects %s with only the requested namespace and minimal methods", async mode => {
    approve(mode);
    if (mode === "keplr") sdk.request.mockResolvedValue({ bech32Address: cosmosAddress, pubKey: Buffer.from(cosmosPubkey).toString("base64"), algo: "secp256k1" });
    await connectQr(() => {}, mode);
    expect(sdk.connect).toHaveBeenCalledWith({ requiredNamespaces: {
      [mode === "evm" ? "eip155" : "cosmos"]: { chains: [mode === "evm" ? "eip155:631" : "cosmos:test-1"],
        methods: mode === "evm" ? ["eth_sendTransaction"] : mode === "keplr" ? ["keplr_getKey", "keplr_signAmino"] : ["cosmos_signAmino"],
        events: mode === "evm" ? ["accountsChanged", "chainChanged"] : [] },
    } });
    expect(store.getState()).toMatchObject({ status: "connected", wcMode: mode });
    expect(Object.keys(store.getState().capabilities)).toEqual([mode === "evm" ? "eip155" : "cosmos"]);
    if (mode === "evm") { expect(http).not.toHaveBeenCalled(); expect(store.getState().bech32Address).toBeNull(); }
    else expect(store.getState()).toMatchObject({ pubkey: cosmosPubkey, writeStatus: "ready" });
  });
  it("sends an EVM transaction only to the selected topic, chain and account", async () => {
    await connectQr(() => {}, "evm");
    const provider = createWalletConnectEvmProvider();
    expect(await provider.request({ method: "eth_chainId" })).toBe("0x277");
    expect(await provider.request({ method: "eth_accounts" })).toEqual([evm]);
    const tx = { from: evm, to: other, value: "0x1", chainId: "0x277" };
    await expect(provider.request({ method: "eth_sendTransaction", params: [tx] })).resolves.toBe("0xhash");
    expect(sdk.request).toHaveBeenCalledTimes(1);
    expect(sdk.request).toHaveBeenCalledWith({ topic: "selected-topic", chainId: "eip155:631", request: { method: "eth_sendTransaction", params: [tx] } });
  });
  it.each(["missing-method", "wrong-chain", "wrong-account", "expired", "nan-expiry", "missing-session", "wrong-topic", "multiple-accounts", "wrong-from", "wrong-tx-chain", "personal_sign", "disconnected"])("%s makes zero wallet requests", async failure => {
    await connectQr(() => {}, "evm"); const provider = createWalletConnectEvmProvider();
    const live = session();
    if (failure === "missing-method") live.namespaces.eip155.methods = [];
    if (failure === "wrong-chain") live.namespaces.eip155.accounts = [`eip155:1:${evm}`];
    if (failure === "wrong-account") live.namespaces.eip155.accounts = [`eip155:631:${other}`];
    if (failure === "expired") live.expiry = 1;
    if (failure === "nan-expiry") live.expiry = NaN;
    if (failure === "wrong-topic") live.topic = "other-topic";
    if (failure === "multiple-accounts") live.namespaces.eip155.accounts.push(`eip155:631:${other}`);
    sdk.get.mockReturnValue(failure === "missing-session" ? undefined : live);
    if (failure === "disconnected") await disconnectWallet();
    await expect(provider.request({ method: failure === "personal_sign" ? "personal_sign" : "eth_sendTransaction", params: [{ from: failure === "wrong-from" ? other : evm, chainId: failure === "wrong-tx-chain" ? "0x1" : "0x277" }] })).rejects.toThrow();
    expect(sdk.request).not.toHaveBeenCalled();
  });
  it("preserves wallet address spelling while comparing EVM grants case-insensitively", () => {
    const live = session(); const mixed = `0x${"aB".repeat(20)}`;
    live.namespaces.eip155.accounts = [`eip155:631:${mixed}`];
    expect(normalizeWalletConnectSession(live, chain, "evm").evmAddress).toBe(mixed);
    expect(() => assertWalletConnectRequest(live, live.topic, chain, "evm", mixed.toLowerCase(), "eth_sendTransaction")).not.toThrow();
  });
  it("keeps multi-namespace permissions separate and ignores unused ecosystem accounts", async () => {
    const live = session(); live.namespaces.cosmos = { accounts: [`cosmos:test-1:${cosmosAddress}`, "cosmos:test-1:unused"], methods: ["cosmos_signAmino"], events: [] };
    approve("evm", live); await connectQr(() => {}, "evm");
    expect(store.getState()).toMatchObject({ status: "connected", bech32Address: null, evmAddress: evm });
    expect(store.getState().capabilities.cosmos.methods).toEqual(["cosmos_signAmino"]);
    expect(store.getState().capabilities.eip155.methods).toEqual(["eth_sendTransaction"]);
  });
  it("does not borrow grants from a different namespace or chain-scoped entry", () => {
    const live = session(); live.namespaces.eip155.methods = [];
    live.namespaces["eip155:1"] = { accounts: [`eip155:1:${evm}`], methods: ["eth_sendTransaction"], events: [] };
    live.namespaces.cosmos = { accounts: [`eip155:631:${evm}`], methods: ["eth_sendTransaction"], events: [] };
    expect(() => assertWalletConnectRequest(live, live.topic, chain, "evm", evm, "eth_sendTransaction")).toThrow();
    const normalized = normalizeWalletConnectSession(live, chain, "evm");
    expect(normalized.capabilities.cosmos.accounts).toEqual([]);
  });
  it.each([undefined, "0x277", "guru_631-1", "01"])("does not guess an EVM ID from %s", async evmChainId => {
    configure({ ...chain, evmChainId }); await connectQr(() => {}, "evm");
    expect(store.getState().status).toBe("error"); expect(sdk.connect).not.toHaveBeenCalled();
  });
});

describe("W04 lifecycle and mobile return", () => {
  it("surfaces rejected approval and permits explicit reconnect", async () => {
    sdk.connect.mockResolvedValue({ uri, approval: async () => { throw new Error("User rejected"); } });
    const onUri = vi.fn(); await connectQr(onUri, "evm"); expect(store.getState().status).toBe("error"); expect(onUri).toHaveBeenLastCalledWith(null);
    approve(); await connectQr(onUri, "evm"); expect(store.getState().status).toBe("connected");
  });
  it("clears an expired QR, consumes and disconnects late approval", async () => {
    vi.useFakeTimers(); const pending = deferred<SessionTypes.Struct>();
    sdk.connect.mockResolvedValue({ uri, approval: () => pending.promise }); const onUri = vi.fn();
    const work = connectQr(onUri, "evm"); await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(WALLETCONNECT_PAIRING_TIMEOUT_MS); await work;
    expect(store.getState().status).toBe("error"); expect(onUri).toHaveBeenLastCalledWith(null);
    pending.resolve(session()); await vi.advanceTimersByTimeAsync(1);
    expect(sdk.disconnect).toHaveBeenCalledWith(expect.objectContaining({ topic: "selected-topic" }));
    expect(store.getState().status).toBe("error"); expect(sdk.request).not.toHaveBeenCalled();
  });
  it.each(["accountsChanged", "chainChanged"])("invalidates only matching session_event topic for %s", async name => {
    detach = attachWalletLifecycle(); await connectQr(() => {}, "evm"); const provider = createWalletConnectEvmProvider();
    const listener = sdk.on.mock.calls.find(([event]) => event === "session_event")![1];
    listener({ topic: "unrelated", params: { event: { name } } }); expect(store.getState().status).toBe("connected");
    listener({ topic: "selected-topic", params: { event: { name } } }); expect(store.getState().status).toBe("error");
    await expect(provider.request({ method: "eth_sendTransaction", params: [{ from: evm }] })).rejects.toThrow(); expect(sdk.request).not.toHaveBeenCalled();
    detach(); detach = undefined; expect(sdk.off).toHaveBeenCalledWith("session_event", listener);
  });
  it("expires a connected session without relying on a relay event", async () => {
    vi.useFakeTimers(); detach = attachWalletLifecycle(); approve("evm", { ...session(), expiry: Math.floor(Date.now() / 1000) + 1 });
    await connectQr(() => {}, "evm"); await vi.advanceTimersByTimeAsync(1001);
    expect(store.getState().status).toBe("error"); expect(sdk.request).not.toHaveBeenCalled();
  });
  it.each(["focus", "pageshow"])("revalidates on %s without replaying a wallet request", async event => {
    detach = attachWalletLifecycle(); await connectQr(() => {}, "evm"); sdk.get.mockReturnValue({ ...session(), expiry: 1 });
    window.dispatchEvent(new Event(event)); await waitFor(() => expect(store.getState().status).toBe("error")); expect(sdk.request).not.toHaveBeenCalled();
  });
  it("opens a chosen connection mode through the actual bilingual header", async () => {
    render(<HeaderWalletMenu />, { locale: "en" }); fireEvent.click(screen.getByLabelText("Wallet menu"));
    fireEvent.click(screen.getByText("WalletConnect · EVM")); await waitFor(() => expect(store.getState().wcMode).toBe("evm"));
    expect(sdk.connect.mock.calls[0][0].requiredNamespaces.eip155).toBeDefined();
  });
  it("disables WC alone when project ID is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", ""); render(<HeaderWalletMenu />); fireEvent.click(screen.getByLabelText("지갑 메뉴"));
    expect(screen.getByText("WalletConnect · EVM").closest('[role="menuitem"]')?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Keplr").closest('[role="menuitem"]')?.getAttribute("aria-disabled")).not.toBe("true");
  });
  it("uses Keplr OS-specific links and keeps secrets out of external HTTP links", () => {
    expect(walletConnectMobileLink(uri, "keplr", "Android")).toBe(`intent://wcV2?${uri}#Intent;package=com.chainapsis.keplr;scheme=keplrwallet;end;`);
    expect(walletConnectMobileLink(uri, "keplr", "iPhone")).toBe(`keplrwallet://wcV2?${uri}`);
    expect(walletConnectMobileLink(uri, "keplr", "Macintosh")).toBeNull();
    expect(walletConnectMobileLink("javascript:alert(1)", "evm", "Android")).toBeNull();
    expect(walletConnectMobileLink(`${uri}#inject`, "keplr", "Android")).toBeNull();
  });
  it("renders QR/copy and return guidance, hides stale links on error", () => {
    const view = render(<WalletConnectQrDialog open uri={uri} mode="evm" onClose={() => {}} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(uri);
    expect(screen.getByText(/이 브라우저로 돌아오세요/)).toBeTruthy();
    view.rerender(<WalletConnectQrDialog open uri={uri} error="Rejected" onClose={() => {}} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("W04 key provenance and Keplr wire adapter", () => {
  it("retrieves a wallet key and signs with Keplr methods scoped to the selected topic/chain", async () => {
    approve("keplr"); sdk.request.mockResolvedValue({ bech32Address: cosmosAddress, pubKey: Buffer.from(cosmosPubkey).toString("base64"), algo: "secp256k1" });
    await connectQr(() => {}, "keplr");
    expect(sdk.request).toHaveBeenCalledWith({ topic: "selected-topic", chainId: "cosmos:test-1", request: { method: "keplr_getKey", params: { chainId: "test-1" } } });
    expect(http.mock.calls.some(([url]) => String(url).includes("/auth/"))).toBe(false);
    const signer = createWalletConnectOfflineSigner({ topic: "selected-topic", chainId: "test-1", signerAddress: cosmosAddress, pubkey: cosmosPubkey, mode: "keplr", assertCurrent: () => {} });
    const signDoc = { chain_id: "test-1", account_number: "0", sequence: "0", fee: { amount: [], gas: "1" }, msgs: [], memo: "" };
    sdk.request.mockResolvedValue({ signed: signDoc, signature: {} });
    if (!("signAmino" in signer)) throw new Error("Expected Amino signer");
    await signer.signAmino(cosmosAddress, signDoc);
    expect(sdk.request).toHaveBeenLastCalledWith({ topic: "selected-topic", chainId: "cosmos:test-1", request: { method: "keplr_signAmino", params: { chainId: "test-1", signer: cosmosAddress, signDoc } } });
  });
  it.each(["no-method", "rejection", "wrong-address", "wrong-algo", "empty-key", "hardware"])("%s never creates a writable Keplr session or falls back to LCD", async failure => {
    const live = session("keplr"); if (failure === "no-method") live.namespaces.cosmos.methods = ["keplr_signAmino"];
    approve("keplr", live);
    sdk.request.mockResolvedValue({ bech32Address: failure === "wrong-address" ? "guru1other" : cosmosAddress, pubKey: failure === "empty-key" ? "" : Buffer.from(cosmosPubkey).toString("base64"), algo: failure === "wrong-algo" ? "ethsecp256k1" : "secp256k1", isNanoLedger: failure === "hardware" });
    if (failure === "rejection") sdk.request.mockRejectedValue(new Error("Rejected"));
    await connectQr(() => {}, "keplr"); expect(store.getState().writeStatus).toBe("blocked"); expect(store.getState().pubkey).toBeNull();
    if (failure === "no-method") expect(sdk.request).not.toHaveBeenCalled();
    expect(http.mock.calls.some(([url]) => String(url).includes("/auth/"))).toBe(false);
  });
  it.each(["wrapper", "key-type", "key-address", "null-key"])("rejects LCD %s without a wallet key request", async failure => {
    approve("cosmos");
    http.mockImplementation(async (input: unknown) => Response.json(String(input).includes("/auth/") ? { account: {
      "@type": failure === "wrapper" ? "/unknown.Account" : cosmosSigningProfile.accountTypeUrl,
      address: failure === "key-address" ? "guru1other" : cosmosAddress,
      pub_key: failure === "null-key" ? null : { "@type": failure === "key-type" ? "/unknown.Key" : cosmosSigningProfile.pubkeyTypeUrl, key: Buffer.from(cosmosPubkey).toString("base64") },
    } } : { default_node_info: { network: "test-1" } }));
    await connectQr(() => {}, "cosmos"); expect(store.getState()).toMatchObject({ status: "connected", pubkey: null, writeStatus: "blocked" }); expect(sdk.request).not.toHaveBeenCalled();
  });
});
