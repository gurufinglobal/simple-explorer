// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "../helpers/render";
import { evmChain, from, hash, receipt, setupEvm, to, token } from "../helpers/evm";
import { loadEvmResults, evmResultStorageKey } from "@/services/evm/result-storage";
import { loadEvmAccount, restoreEvmResults, prepareEvmTransfer, refreshEvmReceipt, submitEvmTransfer, useEvmResults } from "@/services/evm/transfer";
import { useWalletSessionStore as wallet } from "@/stores/wallet-session.store";
import { EvmTransactionResults } from "@/components/transactions/evm-transfer-form";
import { SendForm } from "@/components/transactions/send-form";
import { writeBlockReason } from "@/services/wallet/chain-eligibility";
let env: ReturnType<typeof setupEvm>;
beforeEach(() => { env = setupEvm(); });
afterEach(() => { cleanup(); wallet.getState().disconnect(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const input = { recipient: to, amount: "1.000000000000000001" };
const sends = () => env.walletRequest.mock.calls.filter(([args]) => args.method === "eth_sendTransaction");
async function settle() { await waitFor(() => expect(useEvmResults.getState().busy).toBe(false)); }

describe("EVM real service with JSON-RPC and selected wallet boundaries", () => {
  it("reads pending native balance and nonce from the configured public RPC", async () => {
    expect(await loadEvmAccount()).toMatchObject({ nonce: 2, native: { balance: BigInt(env.state.balance), decimals: 18, symbol: "SYN" } });
    expect(env.http.mock.calls.map(([, init]) => JSON.parse(String(init?.body))).filter(v => v.method === "eth_getBalance")[0].params).toEqual([from, "pending"]);
    expect(writeBlockReason(evmChain, wallet.getState())).not.toBeNull();
  });
  it("preserves precise native value, immutable preview, legacy-only fee and actual receipt fee", async () => {
    env.state.receipt = receipt();
    const snapshot = await prepareEvmTransfer(input);
    expect(Object.isFrozen(snapshot.transaction)).toBe(true);
    expect(Object.isFrozen(snapshot.chain.evm!.nativeCurrency)).toBe(true);
    expect(snapshot.amount).toBe(BigInt("1000000000000000001"));
    expect(snapshot.transaction).toMatchObject({ nonce: "0x2", gasPrice: "0x3b9aca00" });
    expect(snapshot.transaction).not.toHaveProperty("maxFeePerGas");
    await submitEvmTransfer(snapshot); await settle();
    await waitFor(() => expect(useEvmResults.getState().results[0]).toMatchObject({ hash, status: "success", actualFee: BigInt(21000) * BigInt(1000000000) }));
    expect(sends()).toHaveLength(1);
    await expect(submitEvmTransfer(snapshot)).rejects.toThrow();
  });
  it("verifies ERC20 metadata/balance and encodes exact transfer with no native value", async () => {
    const snapshot = await prepareEvmTransfer({ recipient: to, amount: "900719925474099.123456", token });
    expect(snapshot.transaction.to).toBe(token); expect(snapshot.transaction.value).toBe("0x0");
    expect(decodeFunctionData({ abi: erc20Abi, data: snapshot.transaction.data! })).toMatchObject({ functionName: "transfer", args: [to, BigInt("900719925474099123456")] });
  });
  it("uses EIP1559 only with explicit evidence and never mixes gasPrice", async () => {
    env = setupEvm({ ...evmChain, evm: { ...evmChain.evm!, feeMode: "eip1559" } });
    const snapshot = await prepareEvmTransfer(input);
    expect(snapshot.transaction.maxFeePerGas).toBeDefined(); expect(snapshot.transaction.maxPriorityFeePerGas).toBeDefined();
    expect(snapshot.transaction).not.toHaveProperty("gasPrice");
  });
  it.each(["rpc-chain", "wallet-chain", "account", "no-config", "insufficient-native", "insufficient-fee", "precision", "exponent", "negative", "checksum"])("blocks %s before wallet submission", async failure => {
    const request = { ...input };
    if (failure === "rpc-chain") env.state.chainId = "0x1";
    if (failure === "wallet-chain") env.state.walletChain = "0x1";
    if (failure === "account") env.state.accounts = [to];
    if (failure === "no-config") env = setupEvm({ ...evmChain, evm: undefined });
    if (failure === "insufficient-native") env.state.balance = "0x1";
    if (failure === "insufficient-fee") env.state.balance = "0xde0b6b3a7640001";
    if (failure === "precision") request.amount = "1.0000000000000000001";
    if (failure === "exponent") request.amount = "1e3";
    if (failure === "negative") request.amount = "-1";
    if (failure === "checksum") request.recipient = "0x123" as typeof to;
    await expect(prepareEvmTransfer(request)).rejects.toThrow(); expect(sends()).toHaveLength(0);
  });
  it.each(["no-code", "metadata-error", "empty-symbol", "precision", "false-transfer", "insufficient-token"])("blocks ERC20 %s", async failure => {
    if (failure === "no-code") env.state.code = "0x";
    if (failure === "metadata-error") env.state.metadataFails = true;
    if (failure === "empty-symbol") env.state.symbol = "";
    if (failure === "false-transfer") env.state.transferResult = false;
    if (failure === "insufficient-token") env.state.tokenBalance = BigInt(1);
    await expect(prepareEvmTransfer({ recipient: to, amount: failure === "precision" ? "1.0000001" : "1", token })).rejects.toThrow();
    expect(sends()).toHaveLength(0);
  });
  it.each(["session", "silent-account", "silent-chain", "nonce", "balance", "expiry", "token-decimals"])("rechecks %s immediately before dispatch", async change => {
    const snapshot = await prepareEvmTransfer({ recipient: to, amount: "1", token: change === "token-decimals" ? token : undefined });
    if (change === "session") wallet.getState().disconnect();
    if (change === "silent-account") env.state.accounts = [to];
    if (change === "silent-chain") env.state.walletChain = "0x1";
    if (change === "nonce") env.state.nonce = "0x3";
    if (change === "balance") env.state.balance = "0x1";
    if (change === "token-decimals") env.state.decimals = 7;
    if (change === "expiry") vi.spyOn(Date, "now").mockReturnValue(snapshot.createdAt + 120001);
    await expect(submitEvmTransfer(snapshot)).rejects.toThrow(); expect(sends()).toHaveLength(0); vi.restoreAllMocks();
  });
  it.each([4001, -32002, -32603])("classifies wallet code %s without any automatic resend", async code => {
    const snapshot = await prepareEvmTransfer(input);
    env.walletRequest.mockImplementation(async ({ method }) => {
      if (method === "eth_sendTransaction") throw { code };
      return method === "eth_chainId" ? "0x277" : [from];
    });
    await submitEvmTransfer(snapshot); await settle();
    expect(useEvmResults.getState().results[0].status).toBe(code === 4001 ? "rejected" : "unknown"); expect(sends()).toHaveLength(1);
  });
  it("locks duplicate dispatch, retains unknown timeout and consumes late hash after account change", async () => {
    vi.useFakeTimers();
    const snapshot = await prepareEvmTransfer(input);
    let resolve!: (value: unknown) => void;
    env.walletRequest.mockImplementation(async ({ method }) => method === "eth_sendTransaction" ? new Promise(r => { resolve = r; }) : method === "eth_chainId" ? "0x277" : [from]);
    await submitEvmTransfer(snapshot);
    await expect(submitEvmTransfer(snapshot)).rejects.toThrow();
    wallet.getState().disconnect();
    await vi.advanceTimersByTimeAsync(60001);
    expect(useEvmResults.getState()).toMatchObject({ busy: true, results: [{ status: "unknown" }] });
    resolve(hash); await vi.advanceTimersByTimeAsync(1);
    expect(useEvmResults.getState().results[0]).toMatchObject({ hash, status: "pending", snapshot: { from, chain: { key: "evm" } } });
    expect(sends()).toHaveLength(1);
  });
  it("restores public receipt data after reload without allowing a restored snapshot to sign", async () => {
    const id = await submitEvmTransfer(await prepareEvmTransfer(input)); await settle();
    await refreshEvmReceipt(id);
    const saved = localStorage.getItem(evmResultStorageKey)!;
    expect(saved).not.toMatch(/sessionTopic|provider|messageCode/);
    useEvmResults.setState({ results: [], busy: false }); localStorage.setItem(evmResultStorageKey, saved);
    wallet.getState().disconnect(); restoreEvmResults();
    const result = useEvmResults.getState().results[0]; expect(result.hash).toBe(hash);
    await expect(submitEvmTransfer(result.snapshot)).rejects.toThrow();
    env.state.receipt = receipt(); await refreshEvmReceipt(id);
    expect(useEvmResults.getState().results[0].status).toBe("success"); expect(sends()).toHaveLength(1);
  });
  it("restores an interrupted dispatch as unknown, rejects malformed storage and reports quota failure", async () => {
    const snapshot = await prepareEvmTransfer(input);
    useEvmResults.setState({ results: [{ id: "interrupted", status: "submitting", snapshot }] });
    expect(loadEvmResults()[0].status).toBe("unknown");
    localStorage.setItem(evmResultStorageKey, '[{"status":"success"}]'); expect(loadEvmResults()).toEqual([]);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    useEvmResults.setState({ results: [{ id: "quota", status: "unknown", snapshot }] });
    expect(useEvmResults.getState().storageWarning).toBe(true); spy.mockRestore();
  });
  it("keeps delayed and timed-out receipts pending, then records a confirmed revert", async () => {
    const id = await submitEvmTransfer(await prepareEvmTransfer(input)); await settle();
    await refreshEvmReceipt(id); expect(useEvmResults.getState().results[0].status).toBe("pending");
    env.http.mockRejectedValueOnce(new Error("timeout")); await refreshEvmReceipt(id);
    expect(useEvmResults.getState().results[0]).toMatchObject({ hash, status: "pending" });
    env.state.receipt = receipt("0x0"); await refreshEvmReceipt(id);
    expect(useEvmResults.getState().results[0].status).toBe("reverted");
  });
});

describe("EVM transfer UI through real services", () => {
  it.each(["ko", "en"] as const)("reviews and sends in %s; results survive wallet disconnect and form unmount", async locale => {
    env.state.receipt = receipt();
    const view = render(<><SendForm /><EvmTransactionResults /></>, { locale });
    fireEvent.change(screen.getByLabelText(locale === "ko" ? "받는 EVM 주소" : "Recipient EVM address"), { target: { value: to } });
    fireEvent.change(screen.getByLabelText(locale === "ko" ? "수량" : "Amount"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "ko" ? "전송 내용 확인" : "Review transfer" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(new RegExp(from))).toBeTruthy(); expect(within(dialog).getByText(/631/)).toBeTruthy();
    const confirm = within(dialog).getByRole("button", { name: locale === "ko" ? "확인 후 지갑 요청" : "Confirm and request wallet" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(useEvmResults.getState().results[0]?.status).toBe("success"));
    act(() => wallet.getState().disconnect()); view.unmount();
    render(<EvmTransactionResults />, { locale }); expect(screen.getByText(hash)).toBeTruthy(); expect(sends()).toHaveLength(1);
  });
  it("invalidates the open confirmation on account change", async () => {
    render(<SendForm />, { locale: "en" });
    fireEvent.change(screen.getByLabelText("Recipient EVM address"), { target: { value: to } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Review transfer" })); await screen.findByRole("dialog");
    act(() => wallet.getState().connect("metamask", null, to, { chainKey: evmChain.key }));
    expect(screen.getByRole("button", { name: "Confirm and request wallet" })).toBeDisabled(); expect(sends()).toHaveLength(0);
  });
});
