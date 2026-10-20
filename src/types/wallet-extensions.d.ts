type KeplrAccount = {
  address: string;
  pubkey?: Uint8Array;
};

type OfflineSigner = {
  getAccounts: () => Promise<KeplrAccount[]>;
};

type KeplrExtension = {
  enable: (chainId: string) => Promise<void>;
};

type EthereumProvider = {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

declare global {
  interface Window {
    keplr?: KeplrExtension;
    getOfflineSigner?: (chainId: string) => OfflineSigner;
    ethereum?: EthereumProvider;
  }
}

export {};
