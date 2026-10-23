
import { ServiceError } from '@/i18n/service-message';
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
  // Separate EVM metadata and fee evidence; never infer from Cosmos decimals.
  evm: z.object({
    nativeCurrency: z.object({ name: z.string().min(1), symbol: z.string().min(1).max(11), decimals: z.number().int().min(0).max(255) }),
    feeMode: z.enum(["legacy", "eip1559"]),
    evidence: z.string().min(1),
  }).optional(),
  bech32Prefix: z.string().min(1).optional(),
  denom: z.string().min(1).optional(),
  chainId: z.string().min(1).optional(),
  nativeDenom: z.string().min(1).optional(),
  bondDenom: z.string().min(1).optional(),
  feeDenom: z.string().min(1).optional(),
  // Codec evidence is separate from permission to use a wallet or an RPC origin.
  signingProfile: z.object({
    family: z.enum(["cosmos", "ethermint", "cosmos-evm"]),
    chainVersion: z.string().min(1),
    accountTypeUrl: z.string().startsWith("/"),
    pubkeyTypeUrl: z.string().startsWith("/"),
    addressAlgorithm: z.enum(["cosmos", "ethereum"]),
    signModes: z.array(z.enum(["direct", "amino"])).min(1),
    evidence: z.string().min(1),
  }).optional(),
  keplrRegistration: z.object({
    coinType: z.number().int().min(0).max(2147483647),
    currency: z.string().min(1),
    // All prefixes must be observed; do not derive validator prefixes from account prefix.
    bech32Config: z.object({
      bech32PrefixAccAddr: z.string().min(1), bech32PrefixAccPub: z.string().min(1),
      bech32PrefixValAddr: z.string().min(1), bech32PrefixValPub: z.string().min(1),
      bech32PrefixConsAddr: z.string().min(1), bech32PrefixConsPub: z.string().min(1),
    }),
    gasPriceStep: z.object({ low: z.number().positive(), average: z.number().positive(), high: z.number().positive() }),
    evidence: z.string().min(1),
  }).optional(),
  // A policy is evidence for MsgSend fees only; it never grants wallet/RPC support.
  sendFeePolicy: FeePolicySchema.optional(),
  stakingCapabilities: z.object({
    delegate: StakingCapabilitySchema.optional(), undelegate: StakingCapabilitySchema.optional(),
    reward: StakingCapabilitySchema.optional(), commission: StakingCapabilitySchema.optional(),
  }).optional(),
  governanceCapabilities: z.object({
    vote: StakingCapabilitySchema.optional(),
    deposit: StakingCapabilitySchema.optional(),
    proposal: StakingCapabilitySchema.extend({
      legacyContent: z.object({
        authority: z.string().min(1),
        evidence: z.string().min(1),
      }).optional(),
    }).optional(),
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

export type AppEnv = z.infer<typeof EnvSchema>;
export type ChainConfig = z.infer<typeof ChainConfigSchema>;
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

export function parseChainConfigs(raw: string | undefined): ChainConfig[] {
  if (raw === undefined) return [];
  let json: unknown;
  try { json = JSON.parse(raw); }
  catch { throw new ServiceError("invalid_chain_configuration_json_correct_the_configuration_and_refresh"); }
  const parsed = z.array(ChainConfigSchema).min(1).safeParse(json);
  if (!parsed.success) throw new ServiceError("invalid_chain_endpoint_or_configuration_field");
  if (new Set(parsed.data.map(c => c.key)).size !== parsed.data.length) throw new ServiceError("duplicate_chain_key");
  for (const chain of parsed.data) {
    for (const url of [chain.lcdUrl, chain.rpcUrl, chain.evmRpcUrl]) {
      if (url && !/^https?:\/\//.test(url)) throw new ServiceError("chain_endpoints_must_be_http_s_urls");
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

  // Static public references above are required for Next's browser inlining.
  return parsed;
}

export function getConfiguredChains(): ChainConfig[] {
  const env = readPublicEnv();
  const fromEnv = parseChainConfigs(env.NEXT_PUBLIC_CHAINS);
  if (fromEnv.length > 0) {
    return fromEnv;
  }
  if (!env.NEXT_PUBLIC_LCD_URL) throw new ServiceError("chain_configuration_required");
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
  if (env.NEXT_PUBLIC_DEFAULT_CHAIN_KEY) throw new ServiceError("the_default_chain_key_is_missing_from_the_configuration_select");
  return chains[0].key;
}

export function getChainByKey(key: string | null | undefined): ChainConfig | null {
  if (!key) {
    return null;
  }
  const chains = getConfiguredChains();
  return chains.find((chain) => chain.key === key) ?? null;
}
