import { transferableAbortController } from "node:util";
import { vi } from "vitest";
import { encodeFunctionResult, erc20Abi, type Hex } from "viem";
import type { ChainConfig } from "@/lib/env";
import { bindInjectedProvider } from "@/services/wallet/injected-provider";
import { useWalletSessionStore as wallet } from "@/stores/wallet-session.store";
import { useEvmResults } from "@/services/evm/transfer";
export const from = `0x${"12".repeat(20)}` as const;
export const to = `0x${"34".repeat(20)}` as const;
export const token = `0x${"56".repeat(20)}` as const;
export const hash = `0x${"ab".repeat(32)}` as const;
export const evmChain: ChainConfig = { key: "evm", name: "Synthetic EVM", lcdUrl: "https://lcd.test", evmRpcUrl: "https://evm.test", evmChainId: "631",
  evm: { nativeCurrency: { name: "Synthetic", symbol: "SYN", decimals: 18 }, feeMode: "legacy", evidence: "test fixture only" } };
export function setupEvm(chain = evmChain) {
  // jsdom AbortSignal is incompatible with Node fetch Request; use matching Node primitives at the HTTP boundary.
  vi.stubGlobal("AbortController", class { constructor() { return transferableAbortController(); } });
  vi.stubEnv("NEXT_PUBLIC_CHAINS", JSON.stringify([chain])); vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHAIN_KEY", chain.key);
  document.cookie = "gf_chain=; max-age=0; path=/";
  localStorage.clear();
  useEvmResults.setState({ results: [], busy: false, storageWarning: false });
  const state = { balance: "0x3635c9adc5dea00000", nonce: "0x2", chainId: "0x277", walletChain: "0x277", accounts: [from] as string[], decimals: 6, symbol: "TOK", tokenBalance: BigInt("900719925474099312345"), code: "0x1234", metadataFails: false, transferResult: true, receipt: null as unknown };
  const walletRequest = vi.fn(async ({ method }: { method: string; params?: unknown }): Promise<unknown> => {
    if (method === "eth_chainId") return state.walletChain;
    if (method === "eth_accounts" || method === "eth_requestAccounts") return state.accounts;
    if (method === "eth_sendTransaction") return hash;
    throw new Error(method);
  });
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  const provider = { isMetaMask: true, request: walletRequest, on: (event: string, cb: (...args: unknown[]) => void) => { listeners[event] = cb; }, removeListener: (event: string) => { delete listeners[event]; } };
  bindInjectedProvider(provider);
  wallet.getState().connect("metamask", null, from, { chainKey: chain.key });
  const http = vi.fn(async (input: unknown, init?: RequestInit) => {
    if (new URL(String(input)).href !== new URL(chain.evmRpcUrl!).href) throw new Error(`Unexpected RPC: ${input}`);
    const { id, method, params } = JSON.parse(String(init?.body));
    let result: unknown;
    switch (method) {
      case "eth_chainId": result = state.chainId; break;
      case "eth_getBalance": result = state.balance; break;
      case "eth_getTransactionCount": result = state.nonce; break;
      case "eth_getCode": result = state.code; break;
      case "eth_estimateGas": result = "0x5208"; break;
      case "eth_gasPrice": result = "0x3b9aca00"; break;
      case "eth_maxPriorityFeePerGas": result = "0x3b9aca00"; break;
      case "eth_getBlockByNumber": result = { number: "0x1", baseFeePerGas: "0x3b9aca00", gasLimit: "0x1c9c380", gasUsed: "0x5208", timestamp: "0x1", transactions: [] }; break;
      case "eth_getTransactionReceipt": result = state.receipt; break;
      case "eth_call": {
        const data = params[0].data as Hex;
        const selector = data.slice(0, 10);
        if (state.metadataFails) return Response.json({ jsonrpc: "2.0", id, error: { code: -32000, message: "metadata unavailable" } });
        if (selector === "0x313ce567") result = encodeFunctionResult({ abi: erc20Abi, functionName: "decimals", result: state.decimals });
        else if (selector === "0x95d89b41") result = encodeFunctionResult({ abi: erc20Abi, functionName: "symbol", result: state.symbol });
        else if (selector === "0x70a08231") result = encodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", result: state.tokenBalance });
        else if (selector === "0xa9059cbb") result = encodeFunctionResult({ abi: erc20Abi, functionName: "transfer", result: state.transferResult });
        else throw new Error(data);
        break;
      }
      default: throw new Error(`Unexpected method: ${method}`);
    }
    return Response.json({ jsonrpc: "2.0", id, result });
  });
  vi.stubGlobal("fetch", http);
  return { state, walletRequest, provider, listeners, http };
}
export function receipt(status = "0x1") {
  return { transactionHash: hash, transactionIndex: "0x0", blockHash: hash, blockNumber: "0x1", from, to,
    cumulativeGasUsed: "0x5208", gasUsed: "0x5208", effectiveGasPrice: "0x3b9aca00", status, type: "0x0", logs: [], logsBloom: `0x${"00".repeat(256)}`, contractAddress: null };
}
