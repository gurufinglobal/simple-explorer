// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "../helpers/render";
import { setupEvm, evmChain, from, hash, to } from "../helpers/evm";
import { discoverMetaMask, type ProviderChoice } from "@/services/wallet/injected-provider";
import { connectExtension } from "@/services/wallet/wallet-lifecycle";
import { switchEvmChain } from "@/services/evm/network";
import { MetaMaskDialog } from "@/components/wallet/metamask-dialog";
import { useWalletSessionStore as wallet } from "@/stores/wallet-session.store";
import { prepareEvmTransfer, submitEvmTransfer, useEvmResults } from "@/services/evm/transfer";
let env: ReturnType<typeof setupEvm>;
let detach: (() => void) | undefined;
beforeEach(() => { env = setupEvm(); });
afterEach(() => { cleanup(); detach?.(); detach = undefined; delete window.ethereum; wallet.getState().disconnect(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function announce(id: string, provider = env.provider, rdns = "io.metamask") {
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: id, rdns, name: "MetaMask", icon: "javascript:throw()" }, provider } }));
}
describe("explicit MetaMask discovery and network checks", () => {
  it("does not accept generic ethereum or a known competing wallet as MetaMask", () => {
    let choices: ProviderChoice[] = [];
    window.ethereum = { request: vi.fn() };
    detach = discoverMetaMask(value => { choices = value; }); expect(choices).toEqual([]); detach();
    window.ethereum = { ...env.provider, isBraveWallet: true }; detach = discoverMetaMask(value => { choices = value; }); expect(choices).toEqual([]);
    announce("other", env.provider, "com.other"); expect(choices).toEqual([]);
  });
  it("selects the clicked announcement, deduplicates announcements, never executes an icon, and ignores window.ethereum", async () => {
    window.ethereum = { request: vi.fn() };
    render(<MetaMaskDialog open onClose={() => {}} />, { locale: "en" });
    const other = { ...env.provider, request: vi.fn() };
    act(() => { announce("first", other); announce("second"); announce("second"); });
    expect(screen.getAllByRole("button", { name: /MetaMask ·/ })).toHaveLength(2);
    expect(document.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "MetaMask · second" }));
    await waitFor(() => expect(wallet.getState().status).toBe("connected"));
    expect(wallet.getState().evmAddress).toBe(from); expect(other.request).not.toHaveBeenCalled(); expect(window.ethereum.request).not.toHaveBeenCalled();
    env.listeners.accountsChanged([to]); expect(wallet.getState().status).toBe("error");
  });
  it("exposes only filtered legacy choices and requires explicit provider selection", async () => {
    let choices: ProviderChoice[] = [];
    window.ethereum = { request: vi.fn(), providers: [env.provider, { ...env.provider, isMetaMask: false }] };
    detach = discoverMetaMask(value => { choices = value; }); expect(choices).toHaveLength(1);
    await connectExtension("metamask"); expect(wallet.getState().status).toBe("error");
    expect(env.walletRequest).not.toHaveBeenCalled();
  });
  it("switches, adds only the configured network on 4902 and rechecks chain ID", async () => {
    let switched = false;
    env.walletRequest.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return switched ? "0x277" : "0x1";
      if (method === "wallet_switchEthereumChain") { if (!switched) throw { code: 4902 }; return null; }
      if (method === "wallet_addEthereumChain") { switched = true; return null; }
      return [from];
    });
    await connectExtension("metamask", env.provider);
    expect(wallet.getState().status).toBe("connected");
    expect(env.walletRequest).toHaveBeenCalledWith({ method: "wallet_addEthereumChain", params: [{ chainId: "0x277", chainName: evmChain.name, nativeCurrency: evmChain.evm!.nativeCurrency, rpcUrls: [evmChain.evmRpcUrl] }] });
    expect(env.walletRequest.mock.calls.filter(([args]) => args.method === "wallet_switchEthereumChain")).toHaveLength(2);
  });
  it.each([4001, -32002])("does not add or request accounts after switch error %s", async code => {
    env.walletRequest.mockImplementation(async ({ method }) => { if (method === "eth_chainId") return "0x1"; throw { code }; });
    await expect(switchEvmChain(env.provider, evmChain)).rejects.toMatchObject({ code });
    expect(env.walletRequest.mock.calls.map(([args]) => args.method)).toEqual(["eth_chainId", "wallet_switchEthereumChain"]);
  });
  it("fails recheck when the wallet claims a successful switch but stays on another chain", async () => {
    env.walletRequest.mockImplementation(async ({ method }) => method === "eth_chainId" ? "0x1" : null);
    await expect(switchEvmChain(env.provider, evmChain)).rejects.toThrow();
  });
  it("does not prompt switch/add if public RPC identity mismatches", async () => {
    env.state.chainId = "0x1"; await expect(switchEvmChain(env.provider, evmChain)).rejects.toThrow(); expect(env.walletRequest).not.toHaveBeenCalled();
  });
  it("retains hash after the selected provider disconnects during its send", async () => {
    const snapshot = await prepareEvmTransfer({ recipient: to, amount: "1" });
    env.walletRequest.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x277";
      if (method === "eth_accounts") return [from];
      env.listeners.disconnect(); return hash;
    });
    await submitEvmTransfer(snapshot);
    await waitFor(() => expect(useEvmResults.getState().results[0]?.hash).toBe(hash));
    expect(wallet.getState().status).toBe("error");
  });
});
