import { PartialQueryError, schemaError } from "@/lib/query-result";
import { apiClients, type QueryClient } from "@/services/clients";
import { getDenomsMetadata, type TokenDenomMetadata } from "./token-metadata.service";

export async function getStakingParams(client: QueryClient = apiClients) {
  const response = await client.lcdGet<{ params?: { bond_denom?: string; unbonding_time?: string } }>("/cosmos/staking/v1beta1/params");
  if (!response.params?.bond_denom || !response.params.unbonding_time) schemaError("bond denom·unbonding params 미확인");
  return { bondDenom: response.params.bond_denom, unbondingTime: response.params.unbonding_time };
}
/** A failed metadata lookup never supplies invented decimals or signing capabilities. */
export async function getAmountMetadata(client: QueryClient = apiClients) {
  try { return await getDenomsMetadata(client); }
  catch (error) { return error instanceof PartialQueryError ? error.data as TokenDenomMetadata[] : []; }
}
