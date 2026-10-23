
import { serviceMessage } from '@/i18n/service-message';
import { resolveChainContext } from "@/lib/chain-selection";
import { createQueryClient } from "@/services/clients";
import { getAddressBalances } from "@/services/guru/address-profile.service";
import { getBlockDetail } from "@/services/guru/block-details.service";
import { getTxDetail } from "@/services/guru/tx-details.service";
import type { ResolvedType } from "@/services/search/query-classifier";
import { resolveSearch } from "./search-resolve.handler";

/** HTTP adapters must pass URL chain and cookie separately; URL always wins. */
export async function lookupByQuery(queryInput?: string, options: {
  chain?: string | null; cookieChain?: string | null; candidate?: ResolvedType;
} = {}) {
  let chain;
  try { chain = resolveChainContext(options.chain ?? null, options.cookieChain ?? null); }
  catch (error) { return { status: 400, body: { message: (error as Error).message } }; }
  const resolution = resolveSearch(queryInput, chain);
  if (resolution.status !== 200 || !("candidates" in resolution.body)) return resolution;
  const body = resolution.body;
  const resolvedType = options.candidate ?? (body.hasConflict ? null : body.resolvedType);
  if (!resolvedType) return { status: 409, body: { ...body, ...serviceMessage("select_a_query_candidate") } };
  if (!body.candidates.includes(resolvedType)) return { status: 400, body: { ...serviceMessage("select_a_valid_candidate") } };
  const client = createQueryClient(chain);
  const query = body.normalized;
  const data = resolvedType === "txHash" ? await getTxDetail(query, client)
    : resolvedType === "address" ? await getAddressBalances(query, client)
    : await getBlockDetail(query, client);
  return data ? { status: 200, body: { resolvedType, data } } : { status: 404, body: { ...serviceMessage("target_not_found") } };
}
