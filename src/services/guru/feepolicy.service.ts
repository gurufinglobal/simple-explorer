import { apiClients } from "@/services/clients";

export type FeePolicyDiscountItem = {
  discountType: string;
  msgType: string;
  amount: string;
};

export type FeePolicyModuleDiscount = {
  module: string;
  discounts: FeePolicyDiscountItem[];
};

export type FeePolicyAccountDiscount = {
  address: string;
  modules: FeePolicyModuleDiscount[];
};

export const FEEPOLICY_ALL_ROUTE_PARAM = "ALL";

type DiscountRaw = {
  discount_type?: string;
  discountType?: string;
  msg_type?: string;
  msgType?: string;
  amount?: string;
};

type ModuleDiscountRaw = {
  module?: string;
  discounts?: DiscountRaw[];
};

type AccountDiscountRaw = {
  address?: string;
  modules?: ModuleDiscountRaw[];
};

type ModeratorAddressResponse = {
  moderator_address?: string;
  moderatorAddress?: string;
};

type DiscountsResponse = {
  discounts?: AccountDiscountRaw[];
  pagination?: {
    next_key?: string | null;
    total?: string;
  };
};

type DiscountResponse = {
  discount?: AccountDiscountRaw;
};

function normalizeDiscount(raw: DiscountRaw): FeePolicyDiscountItem {
  return {
    discountType: raw.discount_type ?? raw.discountType ?? "-",
    msgType: raw.msg_type ?? raw.msgType ?? "-",
    amount: raw.amount ?? "0",
  };
}

function normalizeModuleDiscount(raw: ModuleDiscountRaw): FeePolicyModuleDiscount {
  return {
    module: raw.module ?? "-",
    discounts: (raw.discounts ?? []).map(normalizeDiscount),
  };
}

function normalizeAccountDiscount(raw: AccountDiscountRaw): FeePolicyAccountDiscount {
  return {
    address: raw.address?.trim() ?? "",
    modules: (raw.modules ?? []).map(normalizeModuleDiscount),
  };
}

export function isFeePolicyGlobalAddress(address: string): boolean {
  return address.trim().length === 0;
}

export function toFeePolicyAddressLabel(address: string): string {
  return isFeePolicyGlobalAddress(address) ? FEEPOLICY_ALL_ROUTE_PARAM : address;
}

async function safeLcdGet<T>(path: string): Promise<T | null> {
  if (process.env.NODE_ENV === "test") {
    return null;
  }
  try {
    return await apiClients.lcdGet<T>(path);
  } catch {
    return null;
  }
}

export async function isFeePolicyAvailable(): Promise<boolean> {
  if (process.env.NODE_ENV === "test") {
    return true;
  }
  const response = await safeLcdGet<ModeratorAddressResponse>("/guru/feepolicy/v1/moderator_address");
  return response !== null;
}

export async function getFeePolicyModeratorAddress(): Promise<string | null> {
  if (process.env.NODE_ENV === "test") {
    return "guru1moderatoraddress";
  }
  const response = await safeLcdGet<ModeratorAddressResponse>("/guru/feepolicy/v1/moderator_address");
  if (!response) {
    return null;
  }
  return response.moderator_address ?? response.moderatorAddress ?? null;
}

export async function listFeePolicyDiscounts(): Promise<FeePolicyAccountDiscount[]> {
  if (process.env.NODE_ENV === "test") {
    return [
      {
        address: "guru1exampleaddress",
        modules: [
          {
            module: "exchange",
            discounts: [
              { discountType: "percentage", msgType: "/guru.bex.v1.MsgSwap", amount: "0.10" },
              { discountType: "percentage", msgType: "/guru.bex.v1.MsgAddLiquidity", amount: "0.05" },
            ],
          },
        ],
      },
    ];
  }

  const response = await safeLcdGet<DiscountsResponse>("/guru/feepolicy/v1/discounts");
  if (!response?.discounts) {
    return [];
  }
  return response.discounts.map(normalizeAccountDiscount);
}

export async function getFeePolicyDiscountByAddress(
  address: string,
): Promise<FeePolicyAccountDiscount | null> {
  if (address === FEEPOLICY_ALL_ROUTE_PARAM) {
    const discounts = await listFeePolicyDiscounts();
    return discounts.find((item) => isFeePolicyGlobalAddress(item.address)) ?? null;
  }

  if (!address.trim()) {
    return null;
  }

  if (process.env.NODE_ENV === "test") {
    return {
      address,
      modules: [
        {
          module: "exchange",
          discounts: [{ discountType: "percentage", msgType: "/guru.bex.v1.MsgSwap", amount: "0.10" }],
        },
      ],
    };
  }

  const response = await safeLcdGet<DiscountResponse>(
    `/guru/feepolicy/v1/discounts/${encodeURIComponent(address)}`,
  );
  if (!response?.discount) {
    return null;
  }
  return normalizeAccountDiscount(response.discount);
}
