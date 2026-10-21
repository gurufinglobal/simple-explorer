import { cursorParam, pageRows, queryPage, type LcdPagination } from '@/lib/query-page';
import { PartialQueryError, schemaError } from '@/lib/query-result';
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";

/** Parsed IBC channel (IdentifiedChannel + nested Channel fields). */
export type IbcChannel = {
  portId: string;
  channelId: string;
  /** Normalized for display: OPEN, TRYOPEN, INIT, CLOSED, … */
  state: string;
  /** Raw value from LCD (e.g. STATE_OPEN). */
  stateRaw: string;
  ordering: string;
  version: string;
  connectionHops: string[];
  counterpartyPortId: string;
  counterpartyChannelId: string;
};

type IbcChannelsResponse = {
  pagination?: LcdPagination;
  channels?: Array<Record<string, unknown>>;
};

// Exact protobuf enum values; unknown strings/numbers remain unchanged.
function normalizeState(raw: string): string {
  if (raw === 'STATE_UNINITIALIZED_UNSPECIFIED') return 'UNINITIALIZED';
  const names = ['UNINITIALIZED', 'INIT', 'TRYOPEN', 'OPEN', 'CLOSED'];
  return names.find((name, index) => raw === name || raw === `STATE_${name}` || raw === String(index)) ?? (raw || 'UNKNOWN');
}

function normalizeOrdering(raw: string): string {
  const names = ['NONE_UNSPECIFIED', 'UNORDERED', 'ORDERED'];
  return names.find((name, index) => raw === name || raw === `ORDER_${name}` || raw === String(index)) ?? (raw || '—');
}

function mapChannelEntry(entry: Record<string, unknown>): IbcChannel | null {
  const nested = entry.channel;
  const inner =
    nested && typeof nested === "object" ? (nested as Record<string, unknown>) : entry;

  const portId = String(entry.port_id ?? "").trim();
  const channelId = String(entry.channel_id ?? "").trim();
  if (!portId && !channelId) {
    return null;
  }

  const stateRaw = String(inner.state ?? "");
  const state = normalizeState(stateRaw);

  const orderingRaw = String(inner.ordering ?? "");
  const ordering = normalizeOrdering(orderingRaw);

  const version = String(inner.version ?? "").trim();

  const hopsRaw = inner.connection_hops;
  const connectionHops = Array.isArray(hopsRaw)
    ? hopsRaw.filter((h): h is string => typeof h === "string")
    : [];

  const cp = inner.counterparty;
  let counterpartyPortId = "";
  let counterpartyChannelId = "";
  if (cp && typeof cp === "object") {
    const c = cp as Record<string, unknown>;
    counterpartyPortId = String(c.port_id ?? "").trim();
    counterpartyChannelId = String(c.channel_id ?? "").trim();
  }

  return {
    portId: portId || "—",
    channelId: channelId || "—",
    state,
    stateRaw: stateRaw || "—",
    ordering: ordering || "—",
    version: version || "—",
    connectionHops,
    counterpartyPortId: counterpartyPortId || "—",
    counterpartyChannelId: counterpartyChannelId || "—",
  };
}

export async function getIbcChannels(apiClients: QueryClient = defaultClients): Promise<IbcChannel[]> {
  return pageRows(getIbcChannelsPage(apiClients));
}

export async function getIbcChannelsPage(apiClients: QueryClient = defaultClients, cursor?: string | null) {

  const response = await apiClients.lcdGet<IbcChannelsResponse>(
    `/ibc/core/channel/v1/channels?pagination.limit=100${cursorParam(cursor)}`,
  );
  const raw = response.channels;
  if (!Array.isArray(raw)) schemaError("채널 목록이 올바르지 않습니다.");
  const mapped: IbcChannel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = mapChannelEntry(item as Record<string, unknown>);
    if (row) {
      mapped.push(row);
    }
  }
  const page = queryPage(mapped, response.pagination, 100);
  if (mapped.length !== raw.length) {
    const message = '일부 채널의 식별자가 올바르지 않습니다. 현재 결과는 일부입니다.';
    if (!mapped.length) schemaError(message);
    throw new PartialQueryError(page, { kind: 'schema', message });
  }
  return page;
}
