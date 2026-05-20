type KeplrAccount = {
  address: string;
};

type OfflineSigner = {
  getAccounts: () => Promise<KeplrAccount[]>;
};

type KeplrExtension = {
  enable: (chainId: string) => Promise<void>;
};

type EthereumProvider = {
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
