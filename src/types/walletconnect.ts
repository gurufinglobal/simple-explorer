/**
 * Normalized WalletConnect session fields used by the explorer UI and Zustand store.
 */
export type WalletConnectNormalizedSession = {
  evmAddress: string | null;
  bech32Address: string | null;
  connectedChains: string[];
  sessionTopic: string;
};
