import { collectQuery, schemaError } from "@/lib/query-result";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";
import { getBlockDetail, type BlockDetail } from "./block-details.service";

type RpcStatusResponse = {
  block?: {
    header?: {
      height?: string;
    };
  };
};

export async function getLatestBlockHeight(apiClients: QueryClient = defaultClients): Promise<number> {

  const status = await apiClients.lcdGet<RpcStatusResponse>(
    "/cosmos/base/tendermint/v1beta1/blocks/latest",
  );
  const height = Number(status.block?.header?.height);
  if (!Number.isSafeInteger(height) || height < 1) schemaError();
  return height;
}

/** Fetches blocks with height strictly greater than `heightExclusive` (newest first). */
export async function fetchBlocksNewerThan(heightExclusive: string, maxBlocks: number, apiClients: QueryClient = defaultClients): Promise<BlockDetail[]> {

  const latest = await getLatestBlockHeight(apiClients);
  const exclusive = Number(heightExclusive);
  if (latest <= exclusive || latest <= 0) {
    return [];
  }
  const heights: string[] = [];
  for (let h = latest; h > exclusive && heights.length < maxBlocks; h--) {
    heights.push(String(h));
  }
  const blocks = await collectQuery(heights.map((height) => getBlockDetail(height, apiClients)));
  return blocks.filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function getLatestBlocks(limit = 10, apiClients: QueryClient = defaultClients): Promise<BlockDetail[]> {

  const latestHeight = await getLatestBlockHeight(apiClients);

  const heights = Array.from({ length: limit }, (_, index) => `${latestHeight - index}`).filter(
    (height) => Number(height) > 0,
  );

  const blocks = await collectQuery(heights.map((height) => getBlockDetail(height, apiClients)));
  return blocks.filter((item): item is BlockDetail => item !== null);
}
