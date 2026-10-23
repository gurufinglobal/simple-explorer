// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erc20Abi } from "viem";
import { from, hash, receipt, setupEvm, to, token } from "../helpers/evm";
import { prepareEvmContract, prepareEvmTransfer, refreshEvmReceipt, submitEvmTransfer, useEvmResults } from "@/services/evm/transfer";
import { useWalletSessionStore as wallet } from "@/stores/wallet-session.store";

let env: ReturnType<typeof setupEvm>;
beforeEach(() => { env = setupEvm(); });
afterEach(() => { wallet.getState().disconnect(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const sends = () => env.walletRequest.mock.calls.filter(([args]) => args.method === "eth_sendTransaction");
const prepare = (kind: string) => kind === "contract"
  ? prepareEvmContract({ address: token, abi: JSON.stringify(erc20Abi), signature: "transfer(address,uint256)", arguments: JSON.stringify([to, "1"]), value: "0" })
  : prepareEvmTransfer({ recipient: to, amount: "1", ...(kind === "erc20" ? { token } : {}) });

describe.each(["native", "erc20", "contract"])("%s review at the dispatch boundary", kind => {
  it.each(["http", "wallet"])("blocks expiry during the final %s await", async boundary => {
    const snapshot = await prepare(kind);
    let now = snapshot.createdAt + 119000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    if (boundary === "http") {
      const original = env.http.getMockImplementation()!;
      env.http.mockImplementation(async (...args) => {
        const reply = await original(...args); now = snapshot.createdAt + 121000; return reply;
      });
    } else {
      const original = env.walletRequest.getMockImplementation()!;
      env.walletRequest.mockImplementation(async args => {
        const reply = await original(args);
        if (args.method === "eth_accounts") now = snapshot.createdAt + 121000;
        return reply;
      });
    }
    await expect(submitEvmTransfer(snapshot)).rejects.toMatchObject({ messageCode: "evm_review_expired" });
    expect(sends()).toHaveLength(0);
    expect(useEvmResults.getState()).toMatchObject({ busy: false, results: [] });
  });
  it("dispatches exactly once within the validity window despite a 20-submit burst", async () => {
    const snapshot = await prepare(kind);
    vi.spyOn(Date, "now").mockReturnValue(snapshot.createdAt + 119000);
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => submitEvmTransfer(snapshot)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(19);
    await vi.waitFor(() => expect(useEvmResults.getState().busy).toBe(false));
    expect(sends()).toHaveLength(1);
  });
  it.each(["account", "chain", "session"])("blocks %s changes during HTTP preflight", async change => {
    const snapshot = await prepare(kind);
    const original = env.http.getMockImplementation()!;
    env.http.mockImplementation(async (...args) => {
      const reply = await original(...args);
      if (change === "account") env.state.accounts = [to];
      if (change === "chain") env.state.walletChain = "0x1";
      if (change === "session") wallet.getState().disconnect();
      return reply;
    });
    await expect(submitEvmTransfer(snapshot)).rejects.toMatchObject({ messageCode: change === "chain" ? "evm_chain_mismatch" : "chain_wallet_or_account_changed_reconnect_and_review_the_transaction" });
    expect(sends()).toHaveLength(0);
    expect(useEvmResults.getState().busy).toBe(false);
  });
  it.each(["0x1", "0x0"])("preserves late hash and receipt %s after expiry and disconnect", async status => {
    vi.useFakeTimers();
    const snapshot = await prepare(kind);
    vi.setSystemTime(snapshot.createdAt + 119000);
    let resolve!: (value: unknown) => void;
    env.walletRequest.mockImplementation(async ({ method }) => method === "eth_sendTransaction"
      ? new Promise(r => { resolve = r; }) : method === "eth_chainId" ? "0x277" : [from]);
    const id = await submitEvmTransfer(snapshot);
    wallet.getState().disconnect();
    await vi.advanceTimersByTimeAsync(60001);
    expect(useEvmResults.getState()).toMatchObject({ busy: true, results: [{ status: "unknown" }] });
    resolve(hash); await vi.advanceTimersByTimeAsync(1);
    expect(useEvmResults.getState().results[0]).toMatchObject({ hash, status: "pending", snapshot: { from } });
    env.state.receipt = { ...receipt(status), to: snapshot.transaction.to };
    await refreshEvmReceipt(id);
    expect(useEvmResults.getState().results[0].status).toBe(status === "0x1" ? "success" : "reverted");
    expect(sends()).toHaveLength(1);
    expect(useEvmResults.getState().busy).toBe(false);
  });
});
