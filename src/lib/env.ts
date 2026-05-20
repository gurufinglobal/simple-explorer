import { z } from "zod";

const ChainConfigSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  lcdUrl: z.url(),
  rpcUrl: z.url().optional(),
  evmRpcUrl: z.url().optional(),
  wsUrl: z.url().optional(),
  evmChainId: z.string().min(1).optional(),
  bech32Prefix: z.string().min(1).optional(),
  denom: z.string().min(1).optional(),
  features: z
    .object({
      bex: z.boolean().optional(),
      feepolicy: z.boolean().optional(),
      oracle: z.boolean().optional(),
    })
    .optional(),
});

const EnvSchema = z.object({
  NEXT_PUBLIC_LCD_URL: z.url().optional(),
  NEXT_PUBLIC_RPC_URL: z.url().optional(),
  NEXT_PUBLIC_EVM_RPC_URL: z.url().optional(),
  NEXT_PUBLIC_WS_URL: z.url().optional(),
  NEXT_PUBLIC_CHAINS: z.string().optional(),
  NEXT_PUBLIC_DEFAULT_CHAIN_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_WALLETCONNECT_RELAY_URL: z.url().optional(),
  /** EVM chain id for CAIP-2 `eip155:<id>` (WalletConnect namespaces). */
  NEXT_PUBLIC_EVM_CHAIN_ID: z.string().min(1).optional(),
  /** Bech32 human-readable prefix for Ethermint-style EVM→Cosmos address encoding. */
  NEXT_PUBLIC_BECH32_PREFIX: z.string().min(1).optional(),
});

export type AppEnv = {
  NEXT_PUBLIC_LCD_URL: string;
  NEXT_PUBLIC_RPC_URL: string;
  NEXT_PUBLIC_EVM_RPC_URL: string;
  NEXT_PUBLIC_WS_URL: string;
  NEXT_PUBLIC_CHAINS: string | undefined;
  NEXT_PUBLIC_DEFAULT_CHAIN_KEY: string | undefined;
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: string | undefined;
  NEXT_PUBLIC_WALLETCONNECT_RELAY_URL: string | undefined;
  NEXT_PUBLIC_EVM_CHAIN_ID: string | undefined;
  NEXT_PUBLIC_BECH32_PREFIX: string | undefined;
};

export type ChainConfig = z.infer<typeof ChainConfigSchema>;

const DEFAULT_HOST = "trpc.gurufin.io";
const DEFAULT_LCD_URL = `https://${DEFAULT_HOST}:1317`;
const DEFAULT_RPC_URL = `https://${DEFAULT_HOST}:26657`;
const DEFAULT_EVM_RPC_URL = `https://${DEFAULT_HOST}:8545`;
const DEFAULT_WS_URL = `wss://${DEFAULT_HOST}:26657/websocket`;
const DEFAULT_CHAIN_KEY = "default";

function defaultChainConfig(env: {
  lcdUrl: string;
  rpcUrl?: string;
  evmRpcUrl?: string;
  wsUrl?: string;
  evmChainId?: string;
  bech32Prefix?: string;
}): ChainConfig {
  return {
    key: DEFAULT_CHAIN_KEY,
    name: "Default",
    lcdUrl: env.lcdUrl,
    rpcUrl: env.rpcUrl,
    evmRpcUrl: env.evmRpcUrl,
    wsUrl: env.wsUrl,
    evmChainId: env.evmChainId,
    bech32Prefix: env.bech32Prefix,
  };
}

function parseChainConfigs(raw: string | undefined): ChainConfig[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = z.array(ChainConfigSchema).safeParse(json);
    if (!parsed.success) {
      return [];
    }
    return parsed.data;
  } catch {
    return [];
  }
}

export function readPublicEnv(): AppEnv {
  const parsed = EnvSchema.parse({
    NEXT_PUBLIC_LCD_URL: process.env.NEXT_PUBLIC_LCD_URL,
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
    NEXT_PUBLIC_EVM_RPC_URL: process.env.NEXT_PUBLIC_EVM_RPC_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_CHAINS: process.env.NEXT_PUBLIC_CHAINS,
    NEXT_PUBLIC_DEFAULT_CHAIN_KEY: process.env.NEXT_PUBLIC_DEFAULT_CHAIN_KEY,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    NEXT_PUBLIC_WALLETCONNECT_RELAY_URL: process.env.NEXT_PUBLIC_WALLETCONNECT_RELAY_URL,
    NEXT_PUBLIC_EVM_CHAIN_ID: process.env.NEXT_PUBLIC_EVM_CHAIN_ID,
    NEXT_PUBLIC_BECH32_PREFIX: process.env.NEXT_PUBLIC_BECH32_PREFIX,
  });

  return {
    NEXT_PUBLIC_LCD_URL: parsed.NEXT_PUBLIC_LCD_URL ?? DEFAULT_LCD_URL,
    NEXT_PUBLIC_RPC_URL: parsed.NEXT_PUBLIC_RPC_URL ?? DEFAULT_RPC_URL,
    NEXT_PUBLIC_EVM_RPC_URL: parsed.NEXT_PUBLIC_EVM_RPC_URL ?? DEFAULT_EVM_RPC_URL,
    NEXT_PUBLIC_WS_URL: parsed.NEXT_PUBLIC_WS_URL ?? DEFAULT_WS_URL,
    NEXT_PUBLIC_CHAINS: parsed.NEXT_PUBLIC_CHAINS,
    NEXT_PUBLIC_DEFAULT_CHAIN_KEY: parsed.NEXT_PUBLIC_DEFAULT_CHAIN_KEY,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: parsed.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    NEXT_PUBLIC_WALLETCONNECT_RELAY_URL: parsed.NEXT_PUBLIC_WALLETCONNECT_RELAY_URL,
    NEXT_PUBLIC_EVM_CHAIN_ID: parsed.NEXT_PUBLIC_EVM_CHAIN_ID,
    NEXT_PUBLIC_BECH32_PREFIX: parsed.NEXT_PUBLIC_BECH32_PREFIX,
  };
}

export function getConfiguredChains(): ChainConfig[] {
  const env = readPublicEnv();
  const fromEnv = parseChainConfigs(env.NEXT_PUBLIC_CHAINS);
  if (fromEnv.length > 0) {
    return fromEnv;
  }
  return [
    defaultChainConfig({
      lcdUrl: env.NEXT_PUBLIC_LCD_URL,
      rpcUrl: env.NEXT_PUBLIC_RPC_URL,
      evmRpcUrl: env.NEXT_PUBLIC_EVM_RPC_URL,
      wsUrl: env.NEXT_PUBLIC_WS_URL,
      evmChainId: env.NEXT_PUBLIC_EVM_CHAIN_ID,
      bech32Prefix: env.NEXT_PUBLIC_BECH32_PREFIX,
    }),
  ];
}

export function getDefaultChainKey(): string {
  const env = readPublicEnv();
  const chains = getConfiguredChains();
  if (env.NEXT_PUBLIC_DEFAULT_CHAIN_KEY && chains.some((chain) => chain.key === env.NEXT_PUBLIC_DEFAULT_CHAIN_KEY)) {
    return env.NEXT_PUBLIC_DEFAULT_CHAIN_KEY;
  }
  return chains[0]?.key ?? DEFAULT_CHAIN_KEY;
}

export function getChainByKey(key: string | null | undefined): ChainConfig | null {
  if (!key) {
    return null;
  }
  const chains = getConfiguredChains();
  return chains.find((chain) => chain.key === key) ?? null;
}
