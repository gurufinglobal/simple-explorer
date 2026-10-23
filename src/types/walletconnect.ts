/** Generic Cosmos and Keplr use distinct wire methods; never infer from peer name. */
export type WalletConnectMode = "cosmos" | "keplr" | "evm";
export type WalletConnectCapabilities = Record<string, {
  accounts: string[]; methods: string[]; events: string[];
}>;
export type WalletConnectNormalizedSession = {
  evmAddress: string | null;
  bech32Address: string | null;
  connectedChains: string[];
  sessionTopic: string;
  chainKey?: string;
  chainId?: string;
  methods?: string[];
  capabilities: WalletConnectCapabilities;
  wcMode?: WalletConnectMode;
  expiry?: number;
};
