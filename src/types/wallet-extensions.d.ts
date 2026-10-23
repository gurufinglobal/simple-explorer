import type { KeplrChainInfo, KeplrKey, KeplrSigner } from "@/services/wallet/keplr";

type KeplrExtension = {
  enable: (chainId: string) => Promise<void>;
  getOfflineSignerAuto?: (chainId: string) => Promise<KeplrSigner>;
  getOfflineSigner?: (chainId: string) => KeplrSigner;
  getKey?: (chainId: string) => Promise<KeplrKey>;
  experimentalSuggestChain?: (chainInfo: KeplrChainInfo) => Promise<void>;
};

type EthereumProvider = {
  isMetaMask?: boolean; isBraveWallet?: boolean; isCoinbaseWallet?: boolean;
  providers?: EthereumProvider[];
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

declare global {
  interface Window {
    keplr?: KeplrExtension;
    getOfflineSigner?: (chainId: string) => KeplrSigner;
    getOfflineSignerAuto?: (chainId: string) => Promise<KeplrSigner>;
    ethereum?: EthereumProvider;
  }
}

export {};
