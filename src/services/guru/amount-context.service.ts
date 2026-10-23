
import { serviceText, serviceMessage } from '@/i18n/service-message';
import { PartialQueryError, QueryError, combinedError, queryError, schemaError } from "@/lib/query-result";
import { apiClients, type QueryClient } from "@/services/clients";
import { getDenomsMetadata, type TokenDenomMetadata } from "./token-metadata.service";

export async function getStakingParams(client: QueryClient = apiClients) {
  const response = await client.lcdGet<{ params?: { bond_denom?: string; unbonding_time?: string } }>("/cosmos/staking/v1beta1/params");
  if (!response.params?.bond_denom || !response.params.unbonding_time) schemaError(serviceText("bond_denom_or_unbonding_parameters_unknown"));
  return { bondDenom: response.params.bond_denom, unbondingTime: response.params.unbonding_time };
}
/** Keep raw amounts and successful metadata pages without hiding lookup failures. */
export async function withAmountMetadata<T>(client: QueryClient, load: (metadata: TokenDenomMetadata[]) => Promise<T>): Promise<T> {
  let metadata: TokenDenomMetadata[] = [];
  let metadataError: QueryError | undefined;
  try { metadata = await getDenomsMetadata(client); }
  catch (error) {
    const info = queryError(error);
    if (info.kind === "cancelled") throw error;
    if (error instanceof PartialQueryError) metadata = error.data as TokenDenomMetadata[];
    metadataError = new QueryError({ ...info, ...serviceMessage("metadata_query_failed", { value0: String(info.message) }) });
  }
  const data = await load(metadata).catch(error => {
    if (!metadataError || queryError(error).kind === "cancelled") throw error;
    const info = combinedError([metadataError, error]);
    if (error instanceof PartialQueryError) throw new PartialQueryError(error.data, info);
    throw new QueryError(info);
  });
  if (metadataError) throw new PartialQueryError(data, metadataError.info);
  return data;
}
