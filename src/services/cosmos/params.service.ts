import { apiClients } from "@/services/clients";

type ParamsSectionConfig = {
  key: string;
  title: string;
  paths: string[];
};

export type ParamsSectionResult = {
  key: string;
  title: string;
  status: "ok" | "error";
  sourcePath: string | null;
  data: unknown;
  error: string | null;
};

const SECTION_CONFIGS: ParamsSectionConfig[] = [
  { key: "auth", title: "Auth Params", paths: ["/cosmos/auth/v1beta1/params"] },
  { key: "bank", title: "Bank Params", paths: ["/cosmos/bank/v1beta1/params"] },
  { key: "staking", title: "Staking Params", paths: ["/cosmos/staking/v1beta1/params"] },
  { key: "slashing", title: "Slashing Params", paths: ["/cosmos/slashing/v1beta1/params"] },
  { key: "distribution", title: "Distribution Params", paths: ["/cosmos/distribution/v1beta1/params"] },
  { key: "mint", title: "Mint Params", paths: ["/cosmos/mint/v1beta1/params"] },
  {
    key: "gov-voting",
    title: "Governance Voting Params",
    paths: ["/cosmos/gov/v1/params/voting", "/cosmos/gov/v1beta1/params/voting"],
  },
  {
    key: "gov-tallying",
    title: "Governance Tallying Params",
    paths: ["/cosmos/gov/v1/params/tallying", "/cosmos/gov/v1beta1/params/tallying"],
  },
  {
    key: "gov-deposit",
    title: "Governance Deposit Params",
    paths: ["/cosmos/gov/v1/params/deposit", "/cosmos/gov/v1beta1/params/deposit"],
  },
  { key: "crisis", title: "Crisis Constant Fee", paths: ["/cosmos/crisis/v1beta1/constant_fee"] },
  { key: "ibc-transfer", title: "IBC Transfer Params", paths: ["/ibc/apps/transfer/v1/params"] },
  { key: "oracle", title: "Oracle Params", paths: ["/guru/oracle/v2/params"] },
  {
    key: "feepolicy",
    title: "FeePolicy Params / Config",
    paths: ["/guru/feepolicy/v1/params", "/guru/feepolicy/v1/moderator_address"],
  },
  {
    key: "bex",
    title: "BEX Params / Config",
    paths: ["/guru/bex/v1/params", "/guru/bex/v1/exchanges"],
  },
  {
    key: "feemarket",
    title: "Feemarket Params / Config",
    paths: [
      "/guru/feemarket/v1/params",
      "/cosmos/evm/feemarket/v1/params",
      "/feemarket/feemarket/v1/params",
      "/feemarket/v1/params",
      "/feemarket/feemarket/v1/base_fee",
      "/feemarket/feemarket/v1/block_gas",
    ],
  },
];

async function fetchFirstAvailable(paths: string[]): Promise<{ path: string; data: unknown }> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const data = await apiClients.lcdGet<unknown>(path);
      return { path, data };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("request failed");
}

export async function getChainParamsSections(): Promise<ParamsSectionResult[]> {
  const results = await Promise.all(
    SECTION_CONFIGS.map(async (section): Promise<ParamsSectionResult> => {
      try {
        const response = await fetchFirstAvailable(section.paths);
        return {
          key: section.key,
          title: section.title,
          status: "ok",
          sourcePath: response.path,
          data: response.data,
          error: null,
        };
      } catch {
        return {
          key: section.key,
          title: section.title,
          status: "error",
          sourcePath: null,
          data: null,
          error: "조회 실패 또는 미지원 모듈",
        };
      }
    }),
  );
  return results;
}
