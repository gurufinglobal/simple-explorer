import { apiClients } from "@/services/clients";
import { getBlockDetail, type BlockDetail } from "./block-details.service";

type RpcStatusResponse = {
  block?: {
    header?: {
      height?: string;
    };
  };
};

export async function getLatestBlockHeight(): Promise<number> {
  if (process.env.NODE_ENV === "test") {
    return 0;
  }
  try {
    const status = await apiClients.lcdGet<RpcStatusResponse>(
      "/cosmos/base/tendermint/v1beta1/blocks/latest",
    );
    return Number(status.block?.header?.height ?? "0");
  } catch {
    return 0;
  }
}

/** Fetches blocks with height strictly greater than `heightExclusive` (newest first). */
export async function fetchBlocksNewerThan(heightExclusive: string, maxBlocks: number): Promise<BlockDetail[]> {
  if (process.env.NODE_ENV === "test") {
    return [];
  }
  try {
    const latest = await getLatestBlockHeight();
    const exclusive = Number(heightExclusive);
    if (latest <= exclusive || latest <= 0) {
      return [];
    }
    const heights: string[] = [];
    for (let h = latest; h > exclusive && heights.length < maxBlocks; h--) {
      heights.push(String(h));
    }
    const blocks = await Promise.all(heights.map((height) => getBlockDetail(height)));
    return blocks.filter((item): item is NonNullable<typeof item> => item !== null);
  } catch {
    return [];
  }
}

export async function getLatestBlocks(limit = 10): Promise<BlockDetail[]> {
  if (process.env.NODE_ENV === "test") {
    return [];
  }

  try {
    const status = await apiClients.lcdGet<RpcStatusResponse>(
      "/cosmos/base/tendermint/v1beta1/blocks/latest",
    );
    const latestHeight = Number(status.block?.header?.height ?? "0");
    if (latestHeight <= 0) {
      return [];
    }

    const heights = Array.from({ length: limit }, (_, index) => `${latestHeight - index}`).filter(
      (height) => Number(height) > 0,
    );

    const blocks = await Promise.all(heights.map((height) => getBlockDetail(height)));
    return blocks.filter((item): item is BlockDetail => item !== null);
  } catch {
    return [];
  }
}
