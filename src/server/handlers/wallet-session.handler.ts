import type { HandlerResult } from "./types";

export type WalletSessionPayload = {
  status: "disconnected";
  bech32Address: null;
  evmAddress: null;
};

export function getWalletSession(): HandlerResult<WalletSessionPayload> {
  return {
    status: 200,
    body: {
      status: "disconnected",
      bech32Address: null,
      evmAddress: null,
    },
  };
}
