
import { serviceText, serviceMessage } from '@/i18n/service-message';
import { cursorParam, pageRows, queryPage, type LcdPagination } from '@/lib/query-page';
import { PartialQueryError, QueryError, readFields, schemaError } from "@/lib/query-result";
import { normalizeGovV1Beta1Proposal, normalizeGovV1Proposal } from "@/lib/gov-mapper";
import type {
  GovCoin,
  GovParamsBundle,
  GovTally,
  NormalizedProposal,
  VoteOption,
} from "@/lib/gov-types";
import { apiClients as defaultClients, type QueryClient } from "@/services/clients";

type ProposalsV1Response = {
  proposals?: Record<string, unknown>[];
  pagination?: { next_key?: string | null; total?: string };
};

type ProposalOneV1 = { proposal?: Record<string, unknown> };

type TallyResponse = { tally?: Record<string, unknown> };

type VotesResponse = {
  pagination?: LcdPagination;
  votes?: unknown[];
};

type DepositsResponse = {
  deposits?: unknown[];
};

/** Normalized row for UI (handles gov v1, v1beta1, and nested `vote` wrappers). */
export type GovernanceVoteRow = {
  voter: string;
  optionDisplay: string;
};

export type GovernanceDepositRow = {
  depositor: string;
  amountDisplay: string;
  coins?: GovCoin[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeVoteEntry(raw: unknown): GovernanceVoteRow | null {
  const outer = record(raw);
  const inner = record(outer?.vote ?? outer);
  if (typeof inner?.voter !== "string" || !inner.voter.trim()) {
    return null;
  }
  const voter = inner.voter.trim();

  const opts = inner.options;
  let optionDisplay = "";
  if (Array.isArray(opts)) {
    optionDisplay = opts
      .map((o) => (o as { option?: string }).option)
      .filter(Boolean)
      .join(", ");
  }
  if (!optionDisplay && typeof inner.option === "string") {
    optionDisplay = inner.option;
  }
  return {
    voter,
    optionDisplay: optionDisplay || "—",
  };
}

function normalizeDepositEntry(raw: unknown): GovernanceDepositRow | null {
  const outer = record(raw);
  const inner = record(outer?.deposit ?? outer);
  if (typeof inner?.depositor !== "string" || !inner.depositor.trim()) {
    return null;
  }
  const depositor = inner.depositor.trim();
  const coins = inner.amount;
  let amountDisplay = "";
  if (Array.isArray(coins)) {
    amountDisplay = coins
      .map((c) => {
        const o = c as { denom?: string; amount?: string };
        if (!o.denom || !o.amount || !/^\d+$/.test(o.amount)) return serviceText("amount_unknown");
        return `${o.amount} ${o.denom}`;
      })
      .filter(Boolean)
      .join(", ");
  }
  return {
    depositor,
    amountDisplay: amountDisplay || "—",
    ...(Array.isArray(coins) && coins.every(c => typeof c?.denom === "string" && typeof c?.amount === "string" && /^\d+$/.test(c.amount)) ? { coins: coins as GovCoin[] } : {}),
  };
}

type ParamsVoting = { voting_params?: { voting_period?: string }; params?: { voting_period?: string } };
type ParamsTally = {
  tally_params?: { quorum?: string; threshold?: string; veto_threshold?: string };
  params?: { quorum?: string; threshold?: string; veto_threshold?: string };
};
type ParamsDeposit = {
  deposit_params?: {
    min_deposit?: GovCoin[];
    max_deposit_period?: string;
  };
  params?: { min_deposit?: GovCoin[]; max_deposit_period?: string };
};

/** Retain the response version so legacy proposals use their own mapper. */
async function lcdGetWithVersion<T>(path: string, apiClients: QueryClient): Promise<{ data: T; legacy: boolean }> {
  try {
    return { data: await apiClients.lcdGet<T>(path), legacy: path.startsWith("/cosmos/gov/v1beta1/") };
  } catch (error) {
    if (error instanceof QueryError && error.info.status === 404 && path.startsWith("/cosmos/gov/v1/")) {
      return { data: await apiClients.lcdGet<T>(path.replace("/v1/", "/v1beta1/")), legacy: true };
    }
    throw error;
  }
}

async function safeLcdGet<T>(path: string, apiClients: QueryClient = defaultClients): Promise<T> {
  return (await lcdGetWithVersion<T>(path, apiClients)).data;
}

export async function listProposals(limit = 100, apiClients: QueryClient = defaultClients): Promise<NormalizedProposal[]> {
  return pageRows(listProposalsPage(limit, apiClients));
}
export async function listProposalsPage(limit = 100, apiClients: QueryClient = defaultClients, cursor?: string | null) {
  const { data, legacy } = await lcdGetWithVersion<ProposalsV1Response>(`/cosmos/gov/v1/proposals?pagination.limit=${limit}&pagination.reverse=true${cursorParam(cursor)}`, apiClients);
  if (!Array.isArray(data.proposals)) schemaError(serviceText("invalid_proposal_list"));
  return queryPage(data.proposals.map(legacy ? normalizeGovV1Beta1Proposal : normalizeGovV1Proposal), data.pagination, limit);
}

export async function getProposalRaw(proposalId: string, apiClients: QueryClient = defaultClients): Promise<unknown | null> {
  return safeLcdGet<unknown>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}`, apiClients);
}

export async function getProposal(proposalId: string, apiClients: QueryClient = defaultClients): Promise<NormalizedProposal | null> {
  const { data, legacy } = await lcdGetWithVersion<ProposalOneV1>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}`, apiClients);
  if (!data.proposal) schemaError(serviceText("invalid_proposal_response"));
  return (legacy ? normalizeGovV1Beta1Proposal : normalizeGovV1Proposal)(data.proposal);
}

/** Current tally (useful during voting period). */
export async function getProposalTally(proposalId: string, apiClients: QueryClient = defaultClients): Promise<GovTally | null> {

  const v1 = await safeLcdGet<TallyResponse>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}/tally`, apiClients
  );
  if (v1?.tally) {
    const t = v1.tally as Record<string, string>;
    return {
      yes: t.yes_count ?? t.yes ?? schemaError(),
      abstain: t.abstain_count ?? t.abstain ?? schemaError(),
      no: t.no_count ?? t.no ?? schemaError(),
      noWithVeto: t.no_with_veto_count ?? t.no_with_veto ?? schemaError(),
    };
  }

  return null;
}

export async function getGovParams(apiClients: QueryClient = defaultClients): Promise<GovParamsBundle> {

  return readFields<GovParamsBundle>({ voting: null, tallying: null, deposit: null }, {
    voting: safeLcdGet<ParamsVoting>("/cosmos/gov/v1/params/voting", apiClients).then(response => {
      const value = response?.params ?? response?.voting_params;
      if (!value?.voting_period) schemaError(serviceText("invalid_voting_parameters_response"));
      return { votingPeriod: value.voting_period };
    }),
    tallying: safeLcdGet<ParamsTally>("/cosmos/gov/v1/params/tallying", apiClients).then(response => {
      const value = response?.params ?? response?.tally_params;
      if (!value?.quorum || !value.threshold || !value.veto_threshold) schemaError(serviceText("invalid_tally_parameters_response"));
      return { quorum: value.quorum, threshold: value.threshold, vetoThreshold: value.veto_threshold };
    }),
    deposit: safeLcdGet<ParamsDeposit>("/cosmos/gov/v1/params/deposit", apiClients).then(response => {
      const value = response?.params ?? response?.deposit_params;
      if (!value || !Array.isArray(value.min_deposit)) schemaError(serviceText("invalid_deposit_parameters_response"));
      return { minDeposit: value.min_deposit, maxDepositPeriod: value.max_deposit_period ?? "" };
    }),
  });
}

/** Validate each row here so a malformed sibling cannot erase valid rows. */
function mapGovernanceRows<T>(raw: unknown, normalize: (item: unknown) => T | null, label: string): T[] {
  if (!Array.isArray(raw)) schemaError(serviceText("invalid_list", { value0: String(label) }));
  const rows: T[] = [];
  let invalid = 0;
  for (const item of raw) {
    const row = normalize(item);
    if (row) rows.push(row);
    else invalid++;
  }
  if (invalid) {
    const info = { kind: "schema" as const, ...serviceMessage("invalid_identifiers_in_of_records", { value0: String(label), value1: String(raw.length), value2: String(invalid) }) };
    if (rows.length) throw new PartialQueryError(rows, info);
    throw new QueryError(info);
  }
  return rows;
}

export async function listVotes(proposalId: string, apiClients: QueryClient = defaultClients): Promise<GovernanceVoteRow[]> {
  return pageRows(listVotesPage(proposalId, apiClients));
}
export async function listVotesPage(proposalId: string, apiClients: QueryClient = defaultClients, cursor?: string | null) {
  const response = await safeLcdGet<VotesResponse>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}/votes?pagination.limit=200${cursorParam(cursor)}`, apiClients);
  try { return queryPage(mapGovernanceRows(response.votes, normalizeVoteEntry, serviceText("vote_records")), response.pagination, 200); }
  catch (error) {
    if (error instanceof PartialQueryError) throw new PartialQueryError(queryPage(error.data as GovernanceVoteRow[], response.pagination, 200), error.info);
    throw error;
  }
}

export async function listDeposits(proposalId: string, apiClients: QueryClient = defaultClients): Promise<GovernanceDepositRow[]> {
  const response = await safeLcdGet<DepositsResponse>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}/deposits`, apiClients);
  return mapGovernanceRows(response.deposits, normalizeDepositEntry, serviceText("deposit_records"));
}

/** Map LCD vote option string to app vote option. */
export function parseVoteOptionFromChain(raw: string): VoteOption | null {
  const u = raw.toUpperCase();
  if (u.includes("YES") && !u.includes("VETO")) {
    return "yes";
  }
  if (u.includes("NO_WITH_VETO") || u.includes("VETO")) {
    return "no_with_veto";
  }
  if (u.includes("NO")) {
    return "no";
  }
  if (u.includes("ABSTAIN")) {
    return "abstain";
  }
  return null;
}

type ModuleAccountEntry = {
  name?: string;
  base_account?: { address?: string };
  address?: string;
};

type ModuleAccountsResponse = {
  accounts?: ModuleAccountEntry[];
};

/** Governance module account address (for MsgExecLegacyContent authority). */
export async function getGovModuleAddress(apiClients: QueryClient = defaultClients): Promise<string | null> {

  const res = await safeLcdGet<ModuleAccountsResponse>("/cosmos/auth/v1beta1/module_accounts", apiClients);
  if (!res?.accounts?.length) {
    return null;
  }
  for (const a of res.accounts) {
    if (a.name === "gov") {
      return a.base_account?.address ?? a.address ?? null;
    }
  }
  return null;
}

export async function getAccountPubkeyBytes(address: string, apiClients: QueryClient = defaultClients): Promise<Uint8Array | null> {

  const res = await safeLcdGet<{ account?: unknown }>(`/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`, apiClients);
  const account = record(res?.account);
  const base = record(account?.base_account) ?? record(record(account?.base_vesting_account)?.base_account) ?? account;
  const keyB64 = record(base?.pub_key)?.key;
  if (typeof keyB64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(keyB64)) return null;
  if (!keyB64) {
    return null;
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(keyB64, "base64"));
  }
  const bin = atob(keyB64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export async function getVoteForVoter(
  proposalId: string,
  voterAddress: string, apiClients: QueryClient = defaultClients
): Promise<VoteOption | null> {

  const v1 = await safeLcdGet<{
    vote?: { options?: Array<{ option?: string }> };
  }>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}/votes/${encodeURIComponent(voterAddress)}`, apiClients);

  const opt = v1?.vote?.options?.[0]?.option;
  if (opt) {
    return parseVoteOptionFromChain(opt);
  }

  const legacy = await safeLcdGet<{
    vote?: { option?: string };
  }>(`/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}/votes/${encodeURIComponent(voterAddress)}`, apiClients);

  const legacyOpt = legacy?.vote?.option;
  if (legacyOpt) {
    return parseVoteOptionFromChain(legacyOpt);
  }

  return null;
}
