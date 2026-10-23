import { decodeFunctionData, decodeFunctionResult, encodeFunctionData, getAddress, isAddress, parseUnits, toFunctionSignature, type AbiFunction, type AbiParameter, type Address, type Hex } from "viem";
import { ServiceError } from "@/i18n/service-message";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { evmNetwork, verifyEvmRpc } from "./network";

export const ABI_MAX_BYTES = 65536;
const MAX_ARGUMENT_BYTES = 32768;
export type ContractInput = { address: string; abi: string; signature: string; arguments: string; value: string };
export const contractJson = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2) ?? "null";
function invalidAbi(): never { throw new ServiceError("evm_invalid_abi"); }
function parameter(value: unknown, depth = 0): AbiParameter {
  if (depth > 12 || !value || typeof value !== "object") return invalidAbi();
  const p = value as Record<string, unknown>;
  if (typeof p.type !== "string" || p.type.length > 160 || p.name !== undefined && typeof p.name !== "string") return invalidAbi();
  const base = p.type.replace(/(\[(?:[1-9][0-9]*)?\])+$/, "");
  if (!/^(address|bool|string|bytes(?:[1-9]|[12][0-9]|3[0-2])?|u?int(?:[0-9]+)?|tuple)$/.test(base)) return invalidAbi();
  if (/^u?int/.test(base)) {
    const bits = Number(base.replace(/^u?int/, "") || 256);
    if (bits < 8 || bits > 256 || bits % 8) return invalidAbi();
  }
  const type = p.type.replace(/^uint(?=\[|$)/, "uint256").replace(/^int(?=\[|$)/, "int256");
  if (base === "tuple") {
    if (!Array.isArray(p.components) || p.components.length > 128) return invalidAbi();
    return { type, name: p.name as string | undefined, components: p.components.map(item => parameter(item, depth + 1)) } as AbiParameter;
  }
  return { type, name: p.name as string | undefined } as AbiParameter;
}
export function parseContractAbi(text: string): AbiFunction[] {
  try {
    if (new TextEncoder().encode(text).length > ABI_MAX_BYTES) return invalidAbi();
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data) || !data.length || data.length > 256) return invalidAbi();
    const functions: AbiFunction[] = [];
    const seen = new Set<string>();
    for (const item of data) {
      if (!item || typeof item !== "object" || !["function", "event", "error", "constructor", "fallback", "receive"].includes(item.type)) return invalidAbi();
      if (item.type !== "function") continue;
      if (typeof item.name !== "string" || !/^[a-zA-Z_$][\w$]*$/.test(item.name) || !Array.isArray(item.inputs) || !Array.isArray(item.outputs) || item.inputs.length > 128 || item.outputs.length > 128 || !["view", "pure", "nonpayable", "payable"].includes(item.stateMutability)) return invalidAbi();
      const fn: AbiFunction = { type: "function", name: item.name, stateMutability: item.stateMutability, inputs: item.inputs.map((p: unknown) => parameter(p)), outputs: item.outputs.map((p: unknown) => parameter(p)) };
      const signature = toFunctionSignature(fn);
      if (seen.has(signature)) return invalidAbi();
      seen.add(signature); functions.push(fn);
    }
    if (!functions.length) return invalidAbi();
    return functions;
  } catch { return invalidAbi(); }
}
function argument(p: AbiParameter, value: unknown, depth = 0): unknown {
  if (depth > 24) throw new Error();
  const array = p.type.match(/^(.*)\[([0-9]*)\]$/);
  if (array) {
    if (!Array.isArray(value) || value.length > 1024 || array[2] && value.length !== Number(array[2])) throw new Error();
    return value.map(item => argument({ ...p, type: array[1] } as AbiParameter, item, depth + 1));
  }
  if (p.type === "tuple") {
    const components = (p as AbiParameter & { components: readonly AbiParameter[] }).components;
    if (!Array.isArray(value) || value.length !== components.length) throw new Error();
    return components.map((component, i) => argument(component, value[i], depth + 1));
  }
  if (/^u?int/.test(p.type)) {
    // Strings are required to prevent JSON number rounding before ABI encoding.
    if (typeof value !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(value) || value.length > 80) throw new Error();
    const number = BigInt(value), bits = BigInt(Number(p.type.replace(/^u?int/, "") || 256));
    const signed = p.type.startsWith("int"), limit = BigInt(2) ** (signed ? bits - BigInt(1) : bits);
    if (number < (signed ? -limit : BigInt(0)) || number >= limit) throw new Error();
    return number;
  }
  if (p.type === "bool") { if (typeof value !== "boolean") throw new Error(); return value; }
  if (p.type === "address") { if (typeof value !== "string" || !isAddress(value)) throw new Error(); return getAddress(value); }
  if (p.type === "string") { if (typeof value !== "string") throw new Error(); return value; }
  if (typeof value !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(value) || p.type !== "bytes" && value.length !== 2 + Number(p.type.slice(5)) * 2) throw new Error();
  return value;
}
export function contractInvocation(input: ContractInput, decimals: number) {
  if (!isAddress(input.address)) throw new ServiceError("evm_invalid_address");
  const fn = parseContractAbi(input.abi).find(fn => toFunctionSignature(fn) === input.signature);
  if (!fn) throw new ServiceError("evm_invalid_abi");
  let data: Hex, decodedArguments: string;
  try {
    if (new TextEncoder().encode(input.arguments).length > MAX_ARGUMENT_BYTES) throw new Error();
    const values: unknown = JSON.parse(input.arguments);
    if (!Array.isArray(values) || values.length !== fn.inputs.length) throw new Error();
    const args = fn.inputs.map((p, i) => argument(p, values[i]));
    data = encodeFunctionData({ abi: [fn], functionName: fn.name, args });
    if (data.length > 131074) throw new Error();
    decodedArguments = contractJson(decodeFunctionData({ abi: [fn], data }).args ?? []);
  } catch { throw new ServiceError("evm_invalid_arguments"); }
  const rawValue = input.value || "0";
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(rawValue) || (rawValue.split(".")[1]?.length ?? 0) > decimals || rawValue.length > 100) throw new ServiceError("evm_contract_value");
  const value = parseUnits(rawValue, decimals);
  if (value >= BigInt(2) ** BigInt(256) || fn.stateMutability !== "payable" && value !== BigInt(0)) throw new ServiceError("evm_contract_value");
  return { address: getAddress(input.address), fn, data, value, summary: Object.freeze({ signature: toFunctionSignature(fn), arguments: decodedArguments, mutability: fn.stateMutability }) };
}
export async function requireContractCode(client: Awaited<ReturnType<typeof verifyEvmRpc>>, address: Address) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new ServiceError("evm_no_code");
}
export async function readEvmContract(input: ContractInput) {
  const chain = structuredClone(getActiveChainConfig());
  const invocation = contractInvocation(input, evmNetwork(chain).nativeCurrency.decimals);
  if (!["view", "pure"].includes(invocation.fn.stateMutability)) throw new ServiceError("evm_read_only");
  const wallet = useWalletSessionStore.getState();
  const from = wallet.status === "connected" && wallet.chainKey === chain.key && wallet.evmAddress && isAddress(wallet.evmAddress) ? getAddress(wallet.evmAddress) : undefined;
  const client = await verifyEvmRpc(chain);
  await requireContractCode(client, invocation.address);
  const result = await client.call({ to: invocation.address, data: invocation.data, account: from });
  if (JSON.stringify(chain) !== JSON.stringify(getActiveChainConfig()) || wallet.generation !== useWalletSessionStore.getState().generation) throw new ServiceError("chain_wallet_or_account_changed_reconnect_and_review_the_transaction");
  return contractJson(decodeFunctionResult({ abi: [invocation.fn], functionName: invocation.fn.name, data: result.data ?? "0x" }));
}
