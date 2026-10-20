import { apiClients as defaultClients, type QueryClient } from "@/services/clients";

export type OracleParams = {
  enable: boolean;
  quorumRatio: string;
  reportRetentionBlocks: string;
};

export type OracleRequestRow = {
  id: string;
  category: string;
  symbol: string;
  count: string;
  period: string;
  status: string;
  nonce: string;
};

export type OracleReportRow = {
  requestId: string;
  provider: string;
  rawData: string;
  nonce: string;
  signature: string;
};

export type OracleResultRow = {
  requestId: string;
  aggregatedData: string;
  aggregatedHeight: string;
  aggregatedTime: string;
  nonce: string;
};

type OracleParamsRaw = {
  enable?: boolean;
  quorum_ratio?: string;
  quorumRatio?: string;
  report_retention_blocks?: string | number;
  reportRetentionBlocks?: string | number;
};

type OracleRequestRaw = {
  id?: string | number;
  category?: string | number;
  symbol?: string;
  count?: string | number;
  period?: string | number;
  status?: string | number;
  nonce?: string | number;
};

type OracleReportRaw = {
  request_id?: string | number;
  requestId?: string | number;
  provider?: string;
  raw_data?: string;
  rawData?: string;
  nonce?: string | number;
  signature?: string;
};

type OracleResultRaw = {
  request_id?: string | number;
  requestId?: string | number;
  aggregated_data?: string;
  aggregatedData?: string;
  aggregated_height?: string | number;
  aggregatedHeight?: string | number;
  aggregated_time?: string | number;
  aggregatedTime?: string | number;
  nonce?: string | number;
};

type OracleParamsResponse = {
  params?: OracleParamsRaw;
};

type OracleModeratorAddressResponse = {
  moderator_address?: string;
  moderatorAddress?: string;
};

type OracleCategoriesResponse = {
  categories?: Array<string | number>;
};

type OracleWhitelistResponse = {
  addresses?: string[];
  count?: string | number;
};

type OracleRequestsResponse = {
  requests?: OracleRequestRaw[];
};

type OracleRequestResponse = {
  request?: OracleRequestRaw;
};

type OracleReportsResponse = {
  reports?: OracleReportRaw[];
};

type OracleResultResponse = {
  result?: OracleResultRaw;
};

type OracleResultsResponse = {
  results?: OracleResultRaw[];
};

const CATEGORY_LABEL: Record<string, string> = {
  "0": "CATEGORY_UNSPECIFIED",
  "1": "CATEGORY_OPERATION",
  "2": "CATEGORY_CRYPTO",
  "3": "CATEGORY_CURRENCY",
};

const STATUS_LABEL: Record<string, string> = {
  "0": "STATUS_UNSPECIFIED",
  "1": "STATUS_ACTIVE",
  "2": "STATUS_INACTIVE",
};

function toStringValue(value: string | number | undefined, fallback = "0"): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function normalizeCategory(value: string | number | undefined): string {
  if (value === undefined || value === null) return "CATEGORY_UNSPECIFIED";
  const raw = String(value).trim();
  if (!raw) return "CATEGORY_UNSPECIFIED";
  if (CATEGORY_LABEL[raw]) return CATEGORY_LABEL[raw];
  if (/^CATEGORY_/.test(raw)) return raw;
  return raw.toUpperCase().startsWith("CATEGORY_") ? raw.toUpperCase() : `CATEGORY_${raw.toUpperCase()}`;
}

function normalizeStatus(value: string | number | undefined): string {
  if (value === undefined || value === null) return "STATUS_UNSPECIFIED";
  const raw = String(value).trim();
  if (!raw) return "STATUS_UNSPECIFIED";
  if (STATUS_LABEL[raw]) return STATUS_LABEL[raw];
  if (/^STATUS_/.test(raw)) return raw;
  return raw.toUpperCase().startsWith("STATUS_") ? raw.toUpperCase() : `STATUS_${raw.toUpperCase()}`;
}

function normalizeOracleRequest(raw: OracleRequestRaw): OracleRequestRow {
  return {
    id: toStringValue(raw.id),
    category: normalizeCategory(raw.category),
    symbol: raw.symbol ?? "-",
    count: toStringValue(raw.count),
    period: toStringValue(raw.period),
    status: normalizeStatus(raw.status),
    nonce: toStringValue(raw.nonce),
  };
}

function normalizeOracleReport(raw: OracleReportRaw): OracleReportRow {
  return {
    requestId: toStringValue(raw.request_id ?? raw.requestId),
    provider: raw.provider ?? "-",
    rawData: raw.raw_data ?? raw.rawData ?? "-",
    nonce: toStringValue(raw.nonce),
    signature: raw.signature ?? "",
  };
}

function normalizeOracleResult(raw: OracleResultRaw): OracleResultRow {
  return {
    requestId: toStringValue(raw.request_id ?? raw.requestId),
    aggregatedData: raw.aggregated_data ?? raw.aggregatedData ?? "-",
    aggregatedHeight: toStringValue(raw.aggregated_height ?? raw.aggregatedHeight),
    aggregatedTime: toStringValue(raw.aggregated_time ?? raw.aggregatedTime),
    nonce: toStringValue(raw.nonce),
  };
}

function normalizeOracleParams(raw: OracleParamsRaw | undefined): OracleParams {
  return {
    enable: Boolean(raw?.enable),
    quorumRatio: raw?.quorum_ratio ?? raw?.quorumRatio ?? "0",
    reportRetentionBlocks: toStringValue(raw?.report_retention_blocks ?? raw?.reportRetentionBlocks),
  };
}

async function safeLcdGet<T>(path: string, apiClients: QueryClient = defaultClients): Promise<T | null> {

  return await apiClients.lcdGet<T>(path);
}

export async function isOracleAvailable(apiClients: QueryClient = defaultClients): Promise<boolean> {

  const response = await safeLcdGet<OracleParamsResponse>("/guru/oracle/v2/params", apiClients);
  return response !== null;
}

export async function getOracleParams(apiClients: QueryClient = defaultClients): Promise<OracleParams | null> {

  const response = await safeLcdGet<OracleParamsResponse>("/guru/oracle/v2/params", apiClients);
  if (!response) return null;
  return normalizeOracleParams(response.params);
}

export async function getOracleModeratorAddress(apiClients: QueryClient = defaultClients): Promise<string | null> {

  const response = await safeLcdGet<OracleModeratorAddressResponse>("/guru/oracle/v2/moderator_address", apiClients);
  if (!response) return null;
  return response.moderator_address ?? response.moderatorAddress ?? null;
}

export async function getOracleCategories(apiClients: QueryClient = defaultClients): Promise<string[]> {

  const response = await safeLcdGet<OracleCategoriesResponse>("/guru/oracle/v2/categories", apiClients);
  if (!response?.categories) return [];
  return response.categories.map((category) => normalizeCategory(category));
}

export async function getOracleWhitelist(apiClients: QueryClient = defaultClients): Promise<{ addresses: string[]; count: string }> {

  const response = await safeLcdGet<OracleWhitelistResponse>("/guru/oracle/v2/whitelist", apiClients);
  if (!response) {
    return { addresses: [], count: "0" };
  }
  return {
    addresses: response.addresses ?? [],
    count: toStringValue(response.count),
  };
}

export async function listOracleRequests(filters?: {
  category?: string;
  status?: string;
}, apiClients: QueryClient = defaultClients): Promise<OracleRequestRow[]> {

  const query = new URLSearchParams();
  if (filters?.category && filters.category !== "ALL") {
    query.set("category", filters.category);
  }
  if (filters?.status && filters.status !== "ALL") {
    query.set("status", filters.status);
  }
  const queryString = query.toString();
  const path = queryString ? `/guru/oracle/v2/requests?${queryString}` : "/guru/oracle/v2/requests";
  const response = await safeLcdGet<OracleRequestsResponse>(path, apiClients);
  if (!response?.requests) return [];
  return response.requests.map(normalizeOracleRequest);
}

export async function getOracleRequestById(requestId: string, apiClients: QueryClient = defaultClients): Promise<OracleRequestRow | null> {
  if (!/^[0-9]+$/.test(requestId)) return null;

  const response = await safeLcdGet<OracleRequestResponse>(`/guru/oracle/v2/requests/${encodeURIComponent(requestId)}`, apiClients);
  if (!response?.request) return null;
  return normalizeOracleRequest(response.request);
}

export async function listOracleReports(params: {
  requestId: string;
  nonce?: string;
  provider?: string;
}, apiClients: QueryClient = defaultClients): Promise<OracleReportRow[]> {
  const requestId = params.requestId;
  if (!/^[0-9]+$/.test(requestId)) return [];

  const query = new URLSearchParams();
  if (params.nonce && /^[0-9]+$/.test(params.nonce)) query.set("nonce", params.nonce);
  if (params.provider?.trim()) query.set("provider", params.provider.trim());
  const queryString = query.toString();
  const path = queryString
    ? `/guru/oracle/v2/requests/${encodeURIComponent(requestId)}/reports?${queryString}`
    : `/guru/oracle/v2/requests/${encodeURIComponent(requestId)}/reports`;

  const response = await safeLcdGet<OracleReportsResponse>(path, apiClients);
  if (!response?.reports) return [];
  return response.reports.map(normalizeOracleReport);
}

export async function getOracleLatestResult(requestId: string, apiClients: QueryClient = defaultClients): Promise<OracleResultRow | null> {
  if (!/^[0-9]+$/.test(requestId)) return null;

  const response = await safeLcdGet<OracleResultResponse>(`/guru/oracle/v2/requests/${encodeURIComponent(requestId)}/result?nonce=0`, apiClients
  );
  if (!response?.result || Object.keys(response.result).length === 0) return null;
  return normalizeOracleResult(response.result);
}

export async function listOracleResults(requestId: string, apiClients: QueryClient = defaultClients): Promise<OracleResultRow[]> {
  if (!/^[0-9]+$/.test(requestId)) return [];

  const response = await safeLcdGet<OracleResultsResponse>(`/guru/oracle/v2/requests/${encodeURIComponent(requestId)}/results`, apiClients
  );
  if (!response?.results) return [];
  return response.results.map(normalizeOracleResult);
}
