"use client";
import { contractInvocation, requireContractCode, type ContractInput } from "./contract";
import { loadEvmResults, saveEvmResults } from "./result-storage";
import { create } from "zustand";
import { createWalletClient, custom, encodeFunctionData, erc20Abi, formatUnits, getAddress, isAddress, numberToHex, parseUnits, type Address, type Hex, type TransactionReceipt } from "viem";
import { ServiceError } from "@/i18n/service-message";
import { getActiveChainConfig } from "@/lib/chain-selection";
import type { ChainConfig } from "@/lib/env";
import { useWalletSessionStore as walletStore } from "@/stores/wallet-session.store";
import { getSelectedInjectedProvider, type InjectedProvider } from "@/services/wallet/injected-provider";
import { createWalletConnectEvmProvider } from "@/services/wallet/walletconnect-evm-provider";
import { evmNetwork, providerErrorCode, verifyEvmRpc } from "./network";

export type EvmAsset = Readonly<{ address?: Address; symbol: string; decimals: number; balance: bigint }>;
export type EvmAccount = { native: EvmAsset; token?: EvmAsset; nonce: number };
export type EvmSnapshot = Readonly<{
  chain: ChainConfig; from: Address; to: Address; asset: EvmAsset; amount: bigint; displayAmount: string;
  contract?: Readonly<{ signature: string; arguments: string; mutability: string }>;
  nonce: number; gas: bigint; maxFee: bigint; createdAt: number;
  transaction: Readonly<{ from: Address; to: Address; value: Hex; data?: Hex; chainId: Hex; nonce: Hex; gas: Hex; gasPrice?: Hex; maxFeePerGas?: Hex; maxPriorityFeePerGas?: Hex }>;
}>;
export type EvmResult = { id: string; snapshot: EvmSnapshot; status: "submitting" | "pending" | "unknown" | "success" | "reverted" | "rejected"; hash?: Hex; actualFee?: bigint; error?: unknown };
export const useEvmResults = create<{ results: EvmResult[]; busy: boolean; storageWarning: boolean }>(() => ({ results: [], busy: false, storageWarning: false }));
useEvmResults.subscribe((state, previous) => {
  if (state.results !== previous.results && typeof window !== "undefined") {
    const saved = saveEvmResults(state.results);
    if (state.storageWarning === saved) useEvmResults.setState({ storageWarning: !saved });
  }
});
export function restoreEvmResults() {
  const current = useEvmResults.getState().results;
  const saved = loadEvmResults().filter(item => !current.some(result => result.id === item.id));
  if (saved.length) useEvmResults.setState({ results: [...current, ...saved].slice(0, 20) });
}
const prepared = new WeakMap<EvmSnapshot, { provider: InjectedProvider; assertCurrent: () => void }>();
const consumed = new WeakSet<EvmSnapshot>();
const ZERO = BigInt(0);
const UINT256 = BigInt(2) ** BigInt(256) - BigInt(1);
function address(value: string): Address {
  if (!isAddress(value)) throw new ServiceError("evm_invalid_address");
  return getAddress(value);
}
function context() {
  const state = walletStore.getState();
  const chain = structuredClone(getActiveChainConfig());
  evmNetwork(chain);
  if (state.status !== "connected" || !state.evmAddress || state.chainKey !== chain.key ||
    !(state.walletType === "metamask" || state.walletType === "walletconnect" && state.wcMode === "evm")) throw new ServiceError("evm_connect");
  const from = address(state.evmAddress);
  const provider = state.walletType === "metamask" ? getSelectedInjectedProvider() : createWalletConnectEvmProvider();
  const assertCurrent = () => {
    const current = walletStore.getState();
    if (current.generation !== state.generation || current.status !== "connected" || JSON.stringify(getActiveChainConfig()) !== JSON.stringify(chain)) throw new ServiceError("chain_wallet_or_account_changed_reconnect_and_review_the_transaction");
  };
  return { chain, from, provider, assertCurrent };
}
async function verifyWallet(provider: InjectedProvider, chain: ChainConfig, from: Address, assertCurrent: () => void) {
  assertCurrent();
  const id = await provider.request({ method: "eth_chainId" }); assertCurrent();
  const accounts = await provider.request({ method: "eth_accounts" }); assertCurrent();
  if (typeof id !== "string" || !/^0x[0-9a-f]+$/i.test(id) || BigInt(id) !== BigInt(evmNetwork(chain).id)) throw new ServiceError("evm_chain_mismatch");
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || accounts[0].toLowerCase() !== from.toLowerCase()) throw new ServiceError("chain_wallet_or_account_changed_reconnect_and_review_the_transaction");
}
async function readAccount(chain: ChainConfig, from: Address, token?: string): Promise<EvmAccount> {
  const client = await verifyEvmRpc(chain);
  const [balance, nonce] = await Promise.all([client.getBalance({ address: from, blockTag: "pending" }), client.getTransactionCount({ address: from, blockTag: "pending" })]);
  const native = { ...evmNetwork(chain).nativeCurrency, balance };
  if (!token) return { native, nonce };
  const contract = address(token);
  try {
    const code = await client.getCode({ address: contract });
    if (!code || code === "0x") throw new Error();
    const [decimals, symbol, tokenBalance] = await Promise.all([
      client.readContract({ address: contract, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: contract, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: contract, abi: erc20Abi, functionName: "balanceOf", args: [from] }),
    ]);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255 || !symbol.trim() || symbol.length > 64) throw new Error();
    return { native, nonce, token: { address: contract, decimals, symbol, balance: tokenBalance } };
  } catch { throw new ServiceError("evm_token_metadata"); }
}
export async function loadEvmAccount(token?: string): Promise<EvmAccount> {
  const ctx = context();
  await verifyWallet(ctx.provider, ctx.chain, ctx.from, ctx.assertCurrent);
  const result = await readAccount(ctx.chain, ctx.from, token); ctx.assertCurrent();
  return result;
}
export function prepareEvmTransfer(input: { recipient: string; amount: string; token?: string }) {
  return prepareEvmRequest(input);
}
export function prepareEvmContract(input: ContractInput) {
  return prepareEvmRequest({ recipient: input.address, amount: input.value || "0" }, input);
}
async function prepareEvmRequest(input: { recipient: string; amount: string; token?: string }, contractInput?: ContractInput): Promise<EvmSnapshot> {
  if (useEvmResults.getState().busy) throw new ServiceError("evm_request_pending");
  const { chain, from, provider, assertCurrent } = context();
  const to = address(input.recipient);
  const invocation = contractInput ? contractInvocation(contractInput, evmNetwork(chain).nativeCurrency.decimals) : undefined;
  if (invocation && ["view", "pure"].includes(invocation.fn.stateMutability)) throw new ServiceError("evm_write_only");
  await verifyWallet(provider, chain, from, assertCurrent);
  const account = await readAccount(chain, from, input.token); assertCurrent();
  const asset = account.token ?? account.native;
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(input.amount) || (input.amount.split(".")[1]?.length ?? 0) > asset.decimals) throw new ServiceError("evm_invalid_amount");
  const amount = parseUnits(input.amount, asset.decimals);
  if ((invocation ? amount < ZERO : amount <= ZERO) || amount > UINT256 || amount > asset.balance) throw new ServiceError("evm_insufficient_balance");
  const client = await verifyEvmRpc(chain); assertCurrent();
  const data = invocation?.data ?? (asset.address ? encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }) : undefined);
  const value = asset.address ? ZERO : amount;
  if (invocation) {
    await requireContractCode(client, to);
    await client.call({ account: from, to, data, value }); assertCurrent();
  }
  // Reverts and explicit false returns are not valid ERC20 previews.
  if (asset.address) {
    const simulation = await client.simulateContract({ address: asset.address, abi: erc20Abi, functionName: "transfer", args: [to, amount], account: from });
    if (simulation.result !== true) throw new ServiceError("evm_token_transfer_failed");
  }
  const estimate = await client.estimateGas({ account: from, to: asset.address ?? to, value, data }); assertCurrent();
  const gas = (estimate * BigInt(120) + BigInt(99)) / BigInt(100);
  const network = evmNetwork(chain);
  const fee: { gasPrice?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint } = network.feeMode === "legacy" ? { gasPrice: await client.getGasPrice() }
    : await client.estimateFeesPerGas({ type: "eip1559", chain: undefined });
  assertCurrent();
  const price = fee.maxFeePerGas ?? fee.gasPrice;
  if (gas <= ZERO || price === undefined || price < ZERO) throw new ServiceError("evm_invalid_fee");
  const maxFee = gas * price;
  if (value + maxFee > account.native.balance) throw new ServiceError("evm_insufficient_balance");
  // Only freeze metadata copied from configuration, never provider objects.
  const frozenChain = Object.freeze({ ...chain, evm: Object.freeze({ ...chain.evm!, nativeCurrency: Object.freeze({ ...chain.evm!.nativeCurrency }) }) });
  const snapshot: EvmSnapshot = Object.freeze({ chain: frozenChain, from, to, asset: Object.freeze({ ...asset }), amount,
    ...(invocation ? { contract: invocation.summary } : {}), displayAmount: formatUnits(amount, asset.decimals), nonce: account.nonce, gas, maxFee, createdAt: Date.now(),
    transaction: Object.freeze({ from, to: asset.address ?? to, value: numberToHex(value), ...(data ? { data } : {}),
      chainId: numberToHex(network.id), nonce: numberToHex(account.nonce), gas: numberToHex(gas),
      ...(fee.maxFeePerGas !== undefined ? { maxFeePerGas: numberToHex(fee.maxFeePerGas), maxPriorityFeePerGas: numberToHex(fee.maxPriorityFeePerGas!) } : { gasPrice: numberToHex(fee.gasPrice!) }) }),
  });
  prepared.set(snapshot, { provider, assertCurrent }); return snapshot;
}
function update(id: string, changes: Partial<EvmResult>) {
  useEvmResults.setState(state => ({ results: state.results.map(result => result.id === id ? { ...result, ...changes } : result) }));
}
/** Reconcile verified public receipts with original app submissions, never replacing terminal outcomes. */
export function recordEvmReceipt(chain: ChainConfig, receipt: TransactionReceipt) {
  if (!["success", "reverted"].includes(receipt.status)) return;
  useEvmResults.setState(state => ({ results: state.results.map(result =>
    result.hash?.toLowerCase() === receipt.transactionHash.toLowerCase() && result.snapshot.chain.evmChainId === chain.evmChainId &&
    result.snapshot.from.toLowerCase() === receipt.from.toLowerCase() && result.snapshot.transaction.to.toLowerCase() === receipt.to?.toLowerCase() &&
    !["success", "reverted"].includes(result.status)
      ? { ...result, status: receipt.status, actualFee: receipt.gasUsed * receipt.effectiveGasPrice, error: undefined }
      : result) }));
}
export async function refreshEvmReceipt(id: string) {
  const result = useEvmResults.getState().results.find(item => item.id === id);
  if (!result?.hash || result.status === "success" || result.status === "reverted") return;
  try {
    const client = await verifyEvmRpc(result.snapshot.chain);
    const receipt = await client.getTransactionReceipt({ hash: result.hash });
    if (receipt.transactionHash.toLowerCase() !== result.hash.toLowerCase() || receipt.from.toLowerCase() !== result.snapshot.from.toLowerCase() || receipt.to?.toLowerCase() !== result.snapshot.transaction.to.toLowerCase() || !["success", "reverted"].includes(receipt.status)) throw new ServiceError("evm_receipt_mismatch");
    recordEvmReceipt(result.snapshot.chain, receipt);
  } catch (error) {
    // Missing receipt and transport timeout are both unconfirmed, never definitive failure.
    if (!["success", "reverted"].includes(useEvmResults.getState().results.find(item => item.id === id)?.status ?? "")) update(id, { status: "pending", error });
  }
}
export async function submitEvmTransfer(snapshot: EvmSnapshot): Promise<string> {
  restoreEvmResults();
  const binding = prepared.get(snapshot);
  if (!binding || consumed.has(snapshot) || useEvmResults.getState().busy) throw new ServiceError("evm_request_pending");
  useEvmResults.setState({ busy: true });
  let dispatched = false;
  try {
    binding.assertCurrent();
    if (Date.now() - snapshot.createdAt > 120000) throw new ServiceError("evm_review_expired");
    const current = await readAccount(snapshot.chain, snapshot.from, snapshot.asset.address);
    binding.assertCurrent();
    if (current.nonce !== snapshot.nonce || (current.token && (current.token.decimals !== snapshot.asset.decimals || current.token.symbol !== snapshot.asset.symbol))) throw new ServiceError("evm_review_expired");
    if ((current.token ?? current.native).balance < snapshot.amount || current.native.balance < snapshot.maxFee + (snapshot.asset.address ? ZERO : snapshot.amount)) throw new ServiceError("evm_insufficient_balance");
    if (snapshot.contract) {
      const client = await verifyEvmRpc(snapshot.chain);
      await requireContractCode(client, snapshot.to);
      await client.call({ account: snapshot.from, to: snapshot.to, data: snapshot.transaction.data, value: snapshot.amount });
      binding.assertCurrent();
    }
    await verifyWallet(binding.provider, snapshot.chain, snapshot.from, binding.assertCurrent);
    consumed.add(snapshot);
    const id = crypto.randomUUID();
    useEvmResults.setState(state => ({ results: [{ id, snapshot, status: "submitting" }, ...state.results] }));
    // Timeout describes uncertainty. Keep the dispatch lock until the wallet settles and consume late results.
    const timer = setTimeout(() => update(id, { status: "unknown", error: new ServiceError("evm_unknown") }), 60000);
    dispatched = true;
    const { gasPrice, maxFeePerGas, maxPriorityFeePerGas, ...baseTransaction } = snapshot.transaction;
    const transaction = gasPrice !== undefined ? { ...baseTransaction, gasPrice } : { ...baseTransaction, maxFeePerGas: maxFeePerGas!, maxPriorityFeePerGas: maxPriorityFeePerGas! };
    const walletClient = createWalletClient({ transport: custom(binding.provider, { retryCount: 0 }) });
    void walletClient.request({ method: "eth_sendTransaction", params: [transaction] }, { retryCount: 0 }).then(hash => {
      if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) {
        update(id, { status: "unknown", error: new ServiceError("evm_unknown") }); return;
      }
      update(id, { hash: hash as Hex, status: "pending", error: undefined });
      void refreshEvmReceipt(id);
    }).catch(error => {
      const code = providerErrorCode(error);
      update(id, { status: code === 4001 ? "rejected" : "unknown", error: code === 4001 ? new ServiceError("evm_user_rejected") : code === -32002 ? new ServiceError("evm_request_pending") : new ServiceError("evm_unknown") });
    }).finally(() => { clearTimeout(timer); useEvmResults.setState({ busy: false }); });
    return id;
  } finally { if (!dispatched) useEvmResults.setState({ busy: false }); }
}
