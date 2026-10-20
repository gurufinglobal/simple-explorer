import { z } from "zod";

const FeePolicySchema = z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("simulate"),
      gasPrice: z.string().min(1),
      gasMultiplierBps: z.number().int().min(10000).max(100000),
      evidence: z.string().min(1),
      fallback: z.object({ gas: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), evidence: z.string().min(1) }).optional(),
    }),
    z.object({
      mode: z.literal("fixed"),
      gasPrice: z.string().min(1),
      gas: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      evidence: z.string().min(1),
      limitation: z.string().min(1),
    }),
  ]);
const StakingCapabilitySchema = z.object({
  typeUrl: z.string().min(1),
  signing: z.array(z.object({ wallet: z.enum(["keplr", "walletconnect"]), method: z.enum(["direct", "amino"]), evidence: z.string().min(1) })).min(1),
  fee: FeePolicySchema,
  evidence: z.string().min(1),
});

export const ChainConfigSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  lcdUrl: z.url(),
  rpcUrl: z.url().optional(),
  evmRpcUrl: z.url().optional(),
  wsUrl: z.url().optional(),
  evmChainId: z.string().min(1).optional(),
  bech32Prefix: z.string().min(1).optional(),
  denom: z.string().min(1).optional(),
  chainId: z.string().min(1).optional(),
  nativeDenom: z.string().min(1).optional(),
  bondDenom: z.string().min(1).optional(),
  feeDenom: z.string().min(1).optional(),
  // A policy is evidence for MsgSend fees only; it never grants wallet/RPC support.
  sendFeePolicy: FeePolicySchema.optional(),
  stakingCapabilities: z.object({
    delegate: StakingCapabilitySchema.optional(), undelegate: StakingCapabilitySchema.optional(),
    reward: StakingCapabilitySchema.optional(), commission: StakingCapabilitySchema.optional(),
  }).optional(),
  decimals: z.number().int().min(0).max(30).optional(),
  signing: z.array(z.object({
    wallet: z.enum(["keplr", "walletconnect"]),
    method: z.enum(["direct", "amino"]),
    evidence: z.string().min(1),
  })).optional(),
  rpcAccess: z.object({
    origin: z.url(),
    get: z.literal(true), post: z.literal(true), options: z.literal(true),
    observedAt: z.string().min(1), evidence: z.string().min(1),
  }).optional(),
  evidence: z.array(z.string()).optional(),
  features: z
    .object({
      bank: z.boolean().optional(),
      staking: z.boolean().optional(),
      governance: z.boolean().optional(),
      distribution: z.boolean().optional(),
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
const DEV_LCD_URL = "https://tgxn.gurufin.io:1317";
const DEV_RPC_URL = "https://tgxn.gurufin.io:26657";
// Metadata is enriched by parseChainConfigs using the existing W01 observations.
const DEV_CHAINS = JSON.stringify([
  { key: "tgxn", name: "TGXN", lcdUrl: DEV_LCD_URL, rpcUrl: DEV_RPC_URL },
]);

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

export function parseChainConfigs(raw: string | undefined): ChainConfig[] {
  if (raw === undefined) return [];
  let json: unknown;
  try { json = JSON.parse(raw); }
  catch { throw new Error("체인 설정 JSON이 올바르지 않습니다. 설정을 수정하고 새로고침하세요."); }
  const parsed = z.array(ChainConfigSchema).min(1).safeParse(json);
  if (!parsed.success) throw new Error("체인 endpoint 또는 설정 필드가 올바르지 않습니다.");
  if (new Set(parsed.data.map(c => c.key)).size !== parsed.data.length) throw new Error("중복 체인 key입니다.");
  for (const chain of parsed.data) {
    for (const url of [chain.lcdUrl, chain.rpcUrl, chain.evmRpcUrl]) {
      if (url && !/^https?:\/\//.test(url)) throw new Error("체인 endpoint는 HTTP(S) URL이어야 합니다.");
    }
  }
  return parsed.data.map(chain => {
    // W01 public observations; no prefix, fee, decimals or wallet support inferred.
    if (chain.key !== "tgxn" || chain.lcdUrl.replace(/\/$/, "") !== "https://tgxn.gurufin.io:1317") return chain;
    return { ...chain, chainId: "guru_631-1", rpcUrl: chain.rpcUrl ?? "https://tgxn.gurufin.io:26657",
      denom: "agxn", nativeDenom: "agxn", bondDenom: "agxn",
      evidence: [...(chain.evidence ?? []), "W01 2026-10-20T04:43:48Z: LCD/RPC guru_631-1; native/bond agxn. Terminal observation only; browser CORS and signing unverified."] };
  });
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

  // Keep explicit single-chain settings on the existing configuration path.
  // Direct process.env references above are required for Next's client inlining.
  const hasSingleChainOverride = [
    parsed.NEXT_PUBLIC_LCD_URL, parsed.NEXT_PUBLIC_RPC_URL,
    parsed.NEXT_PUBLIC_EVM_RPC_URL, parsed.NEXT_PUBLIC_WS_URL,
    parsed.NEXT_PUBLIC_EVM_CHAIN_ID, parsed.NEXT_PUBLIC_BECH32_PREFIX,
  ].some(value => value !== undefined);
  const useDevPreset = process.env.NODE_ENV === "development"
    && parsed.NEXT_PUBLIC_CHAINS === undefined && !hasSingleChainOverride;

  return {
    NEXT_PUBLIC_LCD_URL: parsed.NEXT_PUBLIC_LCD_URL ?? (useDevPreset ? DEV_LCD_URL : DEFAULT_LCD_URL),
    NEXT_PUBLIC_RPC_URL: parsed.NEXT_PUBLIC_RPC_URL ?? (useDevPreset ? DEV_RPC_URL : DEFAULT_RPC_URL),
    NEXT_PUBLIC_EVM_RPC_URL: parsed.NEXT_PUBLIC_EVM_RPC_URL ?? DEFAULT_EVM_RPC_URL,
    NEXT_PUBLIC_WS_URL: parsed.NEXT_PUBLIC_WS_URL ?? DEFAULT_WS_URL,
    NEXT_PUBLIC_CHAINS: parsed.NEXT_PUBLIC_CHAINS ?? (useDevPreset ? DEV_CHAINS : undefined),
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
  if (env.NEXT_PUBLIC_DEFAULT_CHAIN_KEY) throw new Error("기본 체인 key가 설정 목록에 없습니다. 체인을 선택하세요.");
  return chains[0].key;
}

export function getChainByKey(key: string | null | undefined): ChainConfig | null {
  if (!key) {
    return null;
  }
  const chains = getConfiguredChains();
  return chains.find((chain) => chain.key === key) ?? null;
}
