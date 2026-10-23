// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult, parseAbi, toFunctionSignature, type Hex } from "viem";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "../helpers/render";
import { evmChain, from, hash, receipt, setupEvm, to } from "../helpers/evm";
import { ABI_MAX_BYTES, contractInvocation, parseContractAbi, readEvmContract, type ContractInput } from "@/services/evm/contract";
import { prepareEvmContract, refreshEvmReceipt, submitEvmTransfer, useEvmResults } from "@/services/evm/transfer";
import { loadEvmResults } from "@/services/evm/result-storage";
import { useWalletSessionStore as wallet } from "@/stores/wallet-session.store";
import { EvmContractForm, EvmHashLookup } from "@/components/transactions/evm-contract-tools";
import { EvmTransactionResults } from "@/components/transactions/evm-transfer-form";
import { lookupEvmTransaction } from "@/services/evm/lookup";

const abi = parseAbi([
  "function get(uint256 key) view returns (uint256)",
  "function set(uint256 key) nonpayable",
  "function set(string key) nonpayable",
  "function configure((address owner,uint256[] amounts)[] groups, bytes2 tag, bool enabled) payable",
]);
const input: ContractInput = { address: to, abi: JSON.stringify(abi), signature: "set(uint256)", arguments: '["900719925474099312345"]', value: "0" };
let env: ReturnType<typeof setupEvm>;
let callError: boolean;
let tx: unknown;
let receiptError: boolean;
beforeEach(() => {
  env = setupEvm(); callError = false; receiptError = false; tx = null;
  const base = env.http.getMockImplementation()!;
  env.http.mockImplementation(async (url, init) => {
    const { id, method, params } = JSON.parse(String(init?.body));
    if (method === "eth_getTransactionByHash") return Response.json({ jsonrpc: "2.0", id, result: tx });
    if (method === "eth_getTransactionReceipt" && receiptError) return Response.json({ jsonrpc: "2.0", id, error: { code: -32000, message: "receipt unavailable" } });
    if (method === "eth_call") {
      if (callError) return Response.json({ jsonrpc: "2.0", id, error: { code: 3, message: "execution reverted" } });
      const decoded = decodeFunctionData({ abi, data: params[0].data as Hex });
      return Response.json({ jsonrpc: "2.0", id, result: decoded.functionName === "get" ? encodeFunctionResult({ abi, functionName: "get", result: BigInt("900719925474099312345") }) : "0x" });
    }
    return base(url, init);
  });
});
afterEach(() => { cleanup(); wallet.getState().disconnect(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
const sends = () => env.walletRequest.mock.calls.filter(([args]) => args.method === "eth_sendTransaction");
const calls = (method: string) => env.http.mock.calls.map(([, init]) => JSON.parse(String(init?.body))).filter(v => v.method === method);
const transaction = (type = "0x2") => ({ hash, from, to, value: "0x0", input: "0x", nonce: "0x2", gas: "0x5208", gasPrice: "0x3b9aca00", type, chainId: "0x277", blockHash: null, blockNumber: null, transactionIndex: null });
async function settle() { await waitFor(() => expect(useEvmResults.getState().busy).toBe(false)); }

describe("contract ABI validation and real EVM services", () => {
  it("reads exact uint results with zero wallet requests, including when disconnected", async () => {
    wallet.getState().disconnect();
    expect(await readEvmContract({ ...input, signature: "get(uint256)" })).toBe('"900719925474099312345"');
    expect(env.walletRequest).not.toHaveBeenCalled(); expect(calls("eth_sendTransaction")).toHaveLength(0);
  });
  it("uses a connected EVM caller for reads without signing", async () => {
    await readEvmContract({ ...input, signature: "get(uint256)" });
    expect(calls("eth_call")[0].params[0].from).toBe(from); expect(env.walletRequest).not.toHaveBeenCalled();
  });
  it("distinguishes overloads by full signature and keeps exact decoded values", async () => {
    const number = await prepareEvmContract(input);
    const string = await prepareEvmContract({ ...input, signature: "set(string)", arguments: '["hello"]' });
    expect(number.transaction.data!.slice(0, 10)).not.toBe(string.transaction.data!.slice(0, 10));
    expect(number.contract).toMatchObject({ signature: "set(uint256)", arguments: '[\n  "900719925474099312345"\n]' });
    expect(Object.isFrozen(number.contract)).toBe(true); expect(sends()).toHaveLength(0);
  });
  it("encodes tuple arrays and payable value; simulates and estimates the exact request", async () => {
    const request = { ...input, signature: "configure((address,uint256[])[],bytes2,bool)", arguments: JSON.stringify([[[from, ["1", "9007199254740993"]]], "0xabcd", true]), value: "0.000000000000000001" };
    const snapshot = await prepareEvmContract(request);
    expect(snapshot.transaction.value).toBe("0x1");
    expect(decodeFunctionData({ abi, data: snapshot.transaction.data! })).toMatchObject({ functionName: "configure", args: [[{ owner: from, amounts: [BigInt(1), BigInt("9007199254740993")] }], "0xabcd", true] });
    expect(calls("eth_call")[0].params[0]).toMatchObject({ from, to, data: snapshot.transaction.data, value: "0x1" });
    expect(calls("eth_estimateGas")[0].params[0]).toMatchObject({ from, to, data: snapshot.transaction.data, value: "0x1" });
    env.state.receipt = receipt(); await submitEvmTransfer(snapshot); await settle();
    await waitFor(() => expect(useEvmResults.getState().results[0].status).toBe("success"));
    expect(loadEvmResults()[0].snapshot.contract).toEqual(snapshot.contract); expect(sends()).toHaveLength(1);
  });
  it.each(["json", "size", "empty", "object", "duplicate", "unknown-mutability", "invalid-type", "bad-integer-width", "missing-components", "entries", "depth"])("rejects ABI %s", async kind => {
    const changed = JSON.parse(input.abi);
    let text = input.abi;
    if (kind === "json") text = "[";
    if (kind === "size") text = " ".repeat(ABI_MAX_BYTES + 1);
    if (kind === "empty") text = "[]";
    if (kind === "object") text = "{}";
    if (kind === "duplicate") text = JSON.stringify([...changed, changed[0]]);
    if (kind === "unknown-mutability") { changed[0].stateMutability = "constant"; text = JSON.stringify(changed); }
    if (kind === "invalid-type") { changed[0].inputs[0].type = "uint256[bad]"; text = JSON.stringify(changed); }
    if (kind === "bad-integer-width") { changed[0].inputs[0].type = "uint7"; text = JSON.stringify(changed); }
    if (kind === "missing-components") { changed[0].inputs[0].type = "tuple"; text = JSON.stringify(changed); }
    if (kind === "entries") text = JSON.stringify(Array.from({ length: 257 }, () => changed[0]));
    if (kind === "depth") { let p = { type: "tuple", components: [] as unknown[] }; for (let i = 0; i < 15; i++) p = { type: "tuple", components: [p] }; changed[0].inputs = [p]; text = JSON.stringify(changed); }
    await expect(prepareEvmContract({ ...input, abi: text })).rejects.toThrow(); expect(sends()).toHaveLength(0);
  });
  it.each(['[42]', '["-1"]', '["1e5"]', '["1.1"]', '[]', '["1","2"]', '{"key":"1"}', '[true]', '["' + (BigInt(2) ** BigInt(256)).toString() + '"]', ' '.repeat(32769)])("rejects invalid arguments %s", async argumentsText => {
    await expect(prepareEvmContract({ ...input, arguments: argumentsText })).rejects.toThrow(); expect(sends()).toHaveLength(0);
  });
  it.each(["bad-bool", "short-bytes", "tuple-shape", "invalid-address", "array-integer"])("rejects nested argument %s", async kind => {
    const values: unknown[] = [[[from, ["1"]]], "0xabcd", true];
    if (kind === "bad-bool") values[2] = "true";
    if (kind === "short-bytes") values[1] = "0xab";
    if (kind === "tuple-shape") values[0] = [[from]];
    if (kind === "invalid-address") values[0] = [["0x1234", ["1"]]];
    if (kind === "array-integer") values[0] = [[from, [1]]];
    await expect(prepareEvmContract({ ...input, signature: "configure((address,uint256[])[],bytes2,bool)", arguments: JSON.stringify(values) })).rejects.toThrow(); expect(sends()).toHaveLength(0);
  });
  it("validates fixed arrays and signed integer boundaries", () => {
    const abi = JSON.stringify(parseAbi(["function batch(int8[2] numbers) nonpayable"]));
    expect(contractInvocation({ ...input, abi, signature: "batch(int8[2])", arguments: '[["-128","127"]]' }, 18).data).toBeTruthy();
    for (const args of ['[["-129","127"]]', '[["1"]]', '[["1","128"]]']) expect(() => contractInvocation({ ...input, abi, signature: "batch(int8[2])", arguments: args }, 18)).toThrow();
  });
  it.each(["no-code", "rpc-chain", "wallet-chain", "revert", "nonpayable-value", "precision", "read-as-write", "insufficient", "unknown-function"])("blocks %s before signing", async kind => {
    const request = { ...input };
    if (kind === "no-code") env.state.code = "0x";
    if (kind === "rpc-chain") env.state.chainId = "0x1";
    if (kind === "wallet-chain") env.state.walletChain = "0x1";
    if (kind === "revert") callError = true;
    if (kind === "nonpayable-value") request.value = "1";
    if (kind === "precision") { request.signature = "configure((address,uint256[])[],bytes2,bool)"; request.arguments = '[[],"0xabcd",true]'; request.value = "0.0000000000000000001"; }
    if (kind === "read-as-write") request.signature = "get(uint256)";
    if (kind === "insufficient") env.state.balance = "0x0";
    if (kind === "unknown-function") request.signature = "set(address)";
    await expect(prepareEvmContract(request)).rejects.toThrow(); expect(sends()).toHaveLength(0);
  });
  it.each(["no-code", "rpc-chain", "revert"])("blocks read %s without wallet requests", async kind => {
    if (kind === "no-code") env.state.code = "0x";
    if (kind === "rpc-chain") env.state.chainId = "0x1";
    if (kind === "revert") callError = true;
    await expect(readEvmContract({ ...input, signature: "get(uint256)" })).rejects.toThrow(); expect(env.walletRequest).not.toHaveBeenCalled();
  });
  it("supports pure functions and canonical uint aliases", async () => {
    const functions = JSON.parse(input.abi); functions[0].stateMutability = "pure"; functions[0].inputs[0].type = "uint";
    expect(await readEvmContract({ ...input, abi: JSON.stringify(functions), signature: "get(uint256)" })).toBe('"900719925474099312345"');
    expect(env.walletRequest).not.toHaveBeenCalled();
  });
  it("blocks state-changing ABI on the read-only API", async () => {
    await expect(readEvmContract(input)).rejects.toThrow(); expect(calls("eth_call")).toHaveLength(0); expect(sends()).toHaveLength(0);
  });
  it.each(["session", "account", "chain", "nonce", "code", "revert"])("revalidates %s after review", async kind => {
    const snapshot = await prepareEvmContract(input);
    if (kind === "session") wallet.getState().disconnect();
    if (kind === "account") env.state.accounts = [to];
    if (kind === "chain") env.state.walletChain = "0x1";
    if (kind === "nonce") env.state.nonce = "0x3";
    if (kind === "code") env.state.code = "0x";
    if (kind === "revert") callError = true;
    await expect(submitEvmTransfer(snapshot)).rejects.toThrow(); expect(sends()).toHaveLength(0);
  });
  it.each([4001, -32603])("preserves rejection/unknown for wallet error %s with retry zero", async code => {
    const snapshot = await prepareEvmContract(input);
    env.walletRequest.mockImplementation(async ({ method }) => { if (method === "eth_sendTransaction") throw { code }; return method === "eth_chainId" ? "0x277" : [from]; });
    await submitEvmTransfer(snapshot); await settle();
    expect(useEvmResults.getState().results[0].status).toBe(code === 4001 ? "rejected" : "unknown"); expect(sends()).toHaveLength(1);
  });
  it("retains late contract hash under the original immutable context after timeout and disconnect", async () => {
    vi.useFakeTimers();
    const snapshot = await prepareEvmContract(input);
    let resolve!: (value: unknown) => void;
    env.walletRequest.mockImplementation(async ({ method }) => method === "eth_sendTransaction" ? new Promise(r => { resolve = r; }) : method === "eth_chainId" ? "0x277" : [from]);
    await submitEvmTransfer(snapshot); await expect(submitEvmTransfer(snapshot)).rejects.toThrow();
    wallet.getState().disconnect(); await vi.advanceTimersByTimeAsync(60001);
    expect(useEvmResults.getState().results[0].status).toBe("unknown"); expect(useEvmResults.getState().busy).toBe(true);
    resolve(hash); await vi.advanceTimersByTimeAsync(1);
    expect(useEvmResults.getState().results[0]).toMatchObject({ hash, status: "pending", snapshot: { from, contract: { signature: "set(uint256)" } } });
    expect(sends()).toHaveLength(1);
  });
  it("preserves a confirmed receipt across later query failures", async () => {
    env.state.receipt = receipt(); const id = await submitEvmTransfer(await prepareEvmContract(input)); await settle();
    await waitFor(() => expect(useEvmResults.getState().results[0].status).toBe("success"));
    receiptError = true; await refreshEvmReceipt(id); expect(useEvmResults.getState().results[0].status).toBe("success");
  });
  it("records a reverted receipt for a submitted contract call", async () => {
    env.state.receipt = receipt("0x0"); await submitEvmTransfer(await prepareEvmContract(input)); await settle();
    await waitFor(() => expect(useEvmResults.getState().results[0].status).toBe("reverted")); expect(sends()).toHaveLength(1);
  });
});

describe("EVM hash lookup remains separate from Cosmos", () => {
  it.each(["0x0", hash.slice(2), "g".repeat(64)])("rejects malformed or Cosmos hash %s", async hash => {
    await expect(lookupEvmTransaction(evmChain, hash)).rejects.toThrow(); expect(env.http).not.toHaveBeenCalled();
  });
  it("distinguishes unknown, pending, success and revert without wallet requests", async () => {
    expect(await lookupEvmTransaction(evmChain, hash)).toMatchObject({ networkType: "evm", status: "unknown" });
    tx = transaction(); expect(await lookupEvmTransaction(evmChain, hash)).toMatchObject({ status: "pending", transactionType: "eip1559" });
    env.state.receipt = receipt(); expect(await lookupEvmTransaction(evmChain, hash)).toMatchObject({ status: "success", actualFee: BigInt(21000) * BigInt(1000000000) });
    env.state.receipt = receipt("0x0"); expect(await lookupEvmTransaction(evmChain, hash)).toMatchObject({ status: "reverted" });
    expect(env.walletRequest).not.toHaveBeenCalled();
  });
  it("reconciles a hash receipt with the original app submission", async () => {
    await submitEvmTransfer(await prepareEvmContract(input)); await settle();
    expect(useEvmResults.getState().results[0].status).toBe("pending");
    tx = transaction(); env.state.receipt = receipt();
    await lookupEvmTransaction(evmChain, hash);
    expect(useEvmResults.getState().results[0]).toMatchObject({ hash, status: "success", snapshot: { contract: { signature: "set(uint256)" } } });
    env.state.receipt = receipt("0x0"); await lookupEvmTransaction(evmChain, hash);
    expect(useEvmResults.getState().results[0].status).toBe("success"); expect(sends()).toHaveLength(1);
  });
  it("retains pending contract deployment metadata", async () => {
    tx = { ...transaction(), to: null };
    expect(await lookupEvmTransaction(evmChain, hash)).toMatchObject({ status: "pending", to: null });
  });
  it.each(["0x0", "0x1", "0x2"])("decodes transaction type %s", async type => {
    tx = transaction(type); expect((await lookupEvmTransaction(evmChain, hash)).transactionType).toBe({ "0x0": "legacy", "0x1": "eip2930", "0x2": "eip1559" }[type]);
  });
  it.each(["rpc-chain", "tx-chain", "tx-hash", "receipt-hash", "receipt-address", "rpc-error"])("rejects lookup %s", async kind => {
    tx = transaction(); env.state.receipt = receipt();
    if (kind === "rpc-chain") env.state.chainId = "0x1";
    if (kind === "tx-chain") tx = { ...transaction(), chainId: "0x1" };
    if (kind === "tx-hash") tx = { ...transaction(), hash: `0x${"cd".repeat(32)}` };
    if (kind === "receipt-hash") env.state.receipt = { ...receipt(), transactionHash: `0x${"cd".repeat(32)}` };
    if (kind === "receipt-address") env.state.receipt = { ...receipt(), from: to };
    if (kind === "rpc-error") receiptError = true;
    await expect(lookupEvmTransaction(evmChain, hash)).rejects.toThrow(); expect(sends()).toHaveLength(0);
  });
});

async function fillContract(locale: "ko" | "en", signature = input.signature, args = input.arguments) {
  fireEvent.change(screen.getByLabelText(locale === "ko" ? "컨트랙트 주소" : "Contract address"), { target: { value: to } });
  fireEvent.change(screen.getByLabelText("ABI JSON"), { target: { value: input.abi } });
  fireEvent.mouseDown(screen.getByRole("combobox", { name: locale === "ko" ? "함수 signature" : "Function signature" }));
  const fn = parseContractAbi(input.abi).find(fn => toFunctionSignature(fn) === signature)!;
  fireEvent.click(await screen.findByRole("option", { name: `${signature} · ${fn.stateMutability}` }));
  fireEvent.change(screen.getByLabelText(locale === "ko" ? "인자 JSON" : "Arguments JSON"), { target: { value: args } });
}
describe("real contract and hash UI", () => {
  it.each(["ko", "en"] as const)("reviews full contract details and prevents duplicate send in %s", async locale => {
    env.state.receipt = receipt(); render(<><EvmContractForm /><EvmTransactionResults /></>, { locale }); await fillContract(locale);
    fireEvent.click(screen.getByRole("button", { name: locale === "ko" ? "컨트랙트 쓰기 확인" : "Review contract write" }));
    const dialog = await screen.findByRole("dialog");
    for (const text of [from, to, "631", "set(uint256)", "900719925474099312345", "SYN"]) expect(dialog.textContent).toContain(text);
    expect(within(dialog).getByText(new RegExp(locale === "ko" ? "최대" : "Maximum network fee"))).toBeTruthy();
    const confirm = within(dialog).getByRole("button", { name: locale === "ko" ? "확인 후 지갑 요청" : "Confirm and request wallet" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(useEvmResults.getState().results[0]?.status).toBe("success")); expect(sends()).toHaveLength(1);
  });
  it("reads through UI without confirmation or signing", async () => {
    render(<EvmContractForm />, { locale: "en" }); await fillContract("en", "get(uint256)");
    fireEvent.click(screen.getByRole("button", { name: "Read contract" }));
    expect(await screen.findByText('"900719925474099312345"')).toBeTruthy(); expect(screen.queryByRole("dialog")).toBeNull(); expect(env.walletRequest).not.toHaveBeenCalled();
  });
  it.each(["input", "wallet"])("invalidates confirmation after %s change", async kind => {
    render(<EvmContractForm />, { locale: "en" }); await fillContract("en");
    fireEvent.click(screen.getByRole("button", { name: "Review contract write" })); await screen.findByRole("dialog");
    if (kind === "input") fireEvent.change(screen.getByLabelText("Arguments JSON"), { target: { value: '["1"]' } });
    else act(() => wallet.getState().disconnect());
    expect(screen.getByRole("button", { name: "Confirm and request wallet" })).toBeDisabled(); expect(sends()).toHaveLength(0);
  });
  it("reviews and submits a payable tuple-array call through the UI", async () => {
    render(<EvmContractForm />, { locale: "en" });
    await fillContract("en", "configure((address,uint256[])[],bytes2,bool)", JSON.stringify([[[from, ["42"]]], "0xabcd", true]));
    fireEvent.change(screen.getByLabelText("Native value"), { target: { value: "0.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Review contract write" }));
    const dialog = await screen.findByRole("dialog"); expect(dialog.textContent).toContain("0.25 SYN"); expect(dialog.textContent).toContain("42");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and request wallet" })); await settle();
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(useEvmResults.getState().results[0].snapshot.amount).toBe(BigInt("250000000000000000"));
  });
  it("discards a delayed read after the input changes", async () => {
    const base = env.http.getMockImplementation()!;
    let release!: () => void;
    env.http.mockImplementation(async (url, init) => {
      const { method } = JSON.parse(String(init?.body));
      if (method === "eth_call") await new Promise<void>(resolve => { release = resolve; });
      return base(url, init);
    });
    render(<EvmContractForm />, { locale: "en" }); await fillContract("en", "get(uint256)");
    fireEvent.click(screen.getByRole("button", { name: "Read contract" }));
    await waitFor(() => expect(release).toBeDefined());
    fireEvent.change(screen.getByLabelText("Arguments JSON"), { target: { value: '["1"]' } });
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole("button", { name: "Read contract" })).toBeEnabled());
    expect(screen.queryByText('"900719925474099312345"')).toBeNull(); expect(sends()).toHaveLength(0);
  });
  it("displays ABI errors before network calls", async () => {
    render(<EvmContractForm />, { locale: "en" });
    fireEvent.change(screen.getByLabelText("ABI JSON"), { target: { value: "[" } });
    expect(screen.getByText(/Check ABI JSON/)).toBeTruthy(); expect(env.http).not.toHaveBeenCalled();
  });
  it("keeps a confirmed hash result while warning about a later RPC error", async () => {
    tx = transaction(); env.state.receipt = receipt(); render(<EvmHashLookup />, { locale: "en" });
    fireEvent.change(screen.getByLabelText("EVM hash (with 0x)"), { target: { value: hash } });
    fireEvent.click(screen.getByRole("button", { name: "Look up EVM transaction" }));
    await screen.findByText(/Confirmed success/); receiptError = true;
    fireEvent.click(screen.getByRole("button", { name: "Look up EVM transaction" }));
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBe(2)); expect(screen.getByText(/Confirmed success/)).toBeTruthy(); expect(sends()).toHaveLength(0);
  });
});
