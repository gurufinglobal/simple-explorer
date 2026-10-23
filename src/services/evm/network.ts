import { createPublicClient, http, numberToHex } from "viem";
import type { ChainConfig } from "@/lib/env";
import { ServiceError } from "@/i18n/service-message";
import type { InjectedProvider } from "@/services/wallet/injected-provider";

export function evmNetwork(chain: ChainConfig) {
  if (!chain.evmChainId || !/^[1-9][0-9]*$/.test(chain.evmChainId) ||
    !Number.isSafeInteger(Number(chain.evmChainId)) || !chain.evmRpcUrl || !/^https?:\/\//.test(chain.evmRpcUrl) || !chain.evm) throw new ServiceError("evm_unconfigured");
  return { id: Number(chain.evmChainId), rpc: chain.evmRpcUrl, ...chain.evm };
}
export function evmPublicClient(chain: ChainConfig) {
  return createPublicClient({ transport: http(evmNetwork(chain).rpc, { retryCount: 0, timeout: 15000 }), batch: { multicall: false } });
}
export async function verifyEvmRpc(chain: ChainConfig) {
  const client = evmPublicClient(chain);
  if (await client.getChainId() !== evmNetwork(chain).id) throw new ServiceError("evm_chain_mismatch");
  return client;
}
export function providerErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "number") return error.code;
  return "cause" in error ? providerErrorCode(error.cause) : undefined;
}
export async function switchEvmChain(provider: InjectedProvider, chain: ChainConfig, assertCurrent: () => void = () => {}) {
  const network = evmNetwork(chain);
  await verifyEvmRpc(chain); assertCurrent();
  const chainId = numberToHex(network.id);
  if (await provider.request({ method: "eth_chainId" }) !== chainId) {
    assertCurrent();
    try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] }); }
    catch (error) {
      if (providerErrorCode(error) !== 4902) throw error;
      assertCurrent();
      await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId, chainName: chain.name, nativeCurrency: network.nativeCurrency, rpcUrls: [network.rpc] }] });
      assertCurrent();
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    }
  }
  assertCurrent();
  const actual = await provider.request({ method: "eth_chainId" });
  assertCurrent();
  if (typeof actual !== "string" || !/^0x[0-9a-f]+$/i.test(actual) || BigInt(actual) !== BigInt(network.id)) throw new ServiceError("evm_chain_mismatch");
}
