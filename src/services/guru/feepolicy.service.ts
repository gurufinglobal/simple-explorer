import { apiClients as defaultClients, type QueryClient } from "@/services/clients";

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

async function safeLcdGet<T>(path: string, apiClients: QueryClient = defaultClients): Promise<T | null> {

  return await apiClients.lcdGet<T>(path);
}

export async function isFeePolicyAvailable(apiClients: QueryClient = defaultClients): Promise<boolean> {

  const response = await safeLcdGet<ModeratorAddressResponse>("/guru/feepolicy/v1/moderator_address", apiClients);
  return response !== null;
}

export async function getFeePolicyModeratorAddress(apiClients: QueryClient = defaultClients): Promise<string | null> {

  const response = await safeLcdGet<ModeratorAddressResponse>("/guru/feepolicy/v1/moderator_address", apiClients);
  if (!response) {
    return null;
  }
  return response.moderator_address ?? response.moderatorAddress ?? null;
}

export async function listFeePolicyDiscounts(apiClients: QueryClient = defaultClients): Promise<FeePolicyAccountDiscount[]> {

  const response = await safeLcdGet<DiscountsResponse>("/guru/feepolicy/v1/discounts", apiClients);
  if (!response?.discounts) {
    return [];
  }
  return response.discounts.map(normalizeAccountDiscount);
}

export async function getFeePolicyDiscountByAddress(
  address: string, apiClients: QueryClient = defaultClients
): Promise<FeePolicyAccountDiscount | null> {
  if (address === FEEPOLICY_ALL_ROUTE_PARAM) {
    const discounts = await listFeePolicyDiscounts(apiClients);
    return discounts.find((item) => isFeePolicyGlobalAddress(item.address)) ?? null;
  }

  if (!address.trim()) {
    return null;
  }

  const response = await safeLcdGet<DiscountResponse>(`/guru/feepolicy/v1/discounts/${encodeURIComponent(address)}`, apiClients
  );
  if (!response?.discount) {
    return null;
  }
  return normalizeAccountDiscount(response.discount);
}
