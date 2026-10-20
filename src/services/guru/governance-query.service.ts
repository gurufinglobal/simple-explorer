import { QueryError, readFields, schemaError } from "@/lib/query-result";
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

type ProposalsV1Beta1Response = {
  proposals?: Record<string, unknown>[];
  pagination?: { next_key?: string | null; total?: string };
};

type ProposalOneV1 = { proposal?: Record<string, unknown> };
type ProposalOneV1Beta1 = { proposal?: Record<string, unknown> };

type TallyResponse = { tally?: Record<string, unknown> };

type VotesResponse = {
  votes?: Array<Record<string, unknown>>;
};

type DepositsResponse = {
  deposits?: Array<Record<string, unknown>>;
};

/** Normalized row for UI (handles gov v1, v1beta1, and nested `vote` wrappers). */
export type GovernanceVoteRow = {
  voter: string;
  optionDisplay: string;
};

export type GovernanceDepositRow = {
  depositor: string;
  amountDisplay: string;
};

function normalizeVoteEntry(raw: Record<string, unknown>): GovernanceVoteRow | null {
  const inner = (raw.vote as Record<string, unknown> | undefined) ?? raw;
  const voter = String(inner.voter ?? "").trim();
  if (!voter) {
    return null;
  }

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

function normalizeDepositEntry(raw: Record<string, unknown>): GovernanceDepositRow | null {
  const inner = (raw.deposit as Record<string, unknown> | undefined) ?? raw;
  const depositor = String(inner.depositor ?? "").trim();
  if (!depositor) {
    return null;
  }
  const coins = inner.amount;
  let amountDisplay = "";
  if (Array.isArray(coins)) {
    amountDisplay = coins
      .map((c) => {
        const o = c as { denom?: string; amount?: string };
        return `${o.amount ?? "0"} ${o.denom ?? ""}`.trim();
      })
      .filter(Boolean)
      .join(", ");
  }
  return {
    depositor,
    amountDisplay: amountDisplay || "—",
  };
}

type ParamsVoting = { voting_params?: { voting_period?: string } };
type ParamsTally = {
  tally_params?: { quorum?: string; threshold?: string; veto_threshold?: string };
};
type ParamsDeposit = {
  deposit_params?: {
    min_deposit?: GovCoin[];
    max_deposit_period?: string;
  };
};

async function safeLcdGet<T>(path: string, apiClients: QueryClient = defaultClients): Promise<T | null> {

  try {
    return await apiClients.lcdGet<T>(path);
  } catch (error) {
    if (error instanceof QueryError && error.info.status === 404 && path.startsWith("/cosmos/gov/v1/")) return apiClients.lcdGet<T>(path.replace("/v1/", "/v1beta1/"));
    throw error;
  }
}

export async function listProposals(limit = 100, apiClients: QueryClient = defaultClients): Promise<NormalizedProposal[]> {

  const v1 = await safeLcdGet<ProposalsV1Response>(`/cosmos/gov/v1/proposals?pagination.limit=${limit}&pagination.reverse=true`, apiClients
  );
  if (v1?.proposals) {
    return v1.proposals.map((p) => normalizeGovV1Proposal(p));
  }

  const legacy = await safeLcdGet<ProposalsV1Beta1Response>(`/cosmos/gov/v1beta1/proposals?pagination.limit=${limit}&pagination.reverse=true`, apiClients
  );
  if (legacy?.proposals) {
    return legacy.proposals.map((p) => normalizeGovV1Beta1Proposal(p));
  }

  return [];
}

export async function getProposalRaw(proposalId: string, apiClients: QueryClient = defaultClients): Promise<unknown | null> {

  const v1 = await safeLcdGet<unknown>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}`, apiClients);
  if (v1) {
    return v1;
  }
  return safeLcdGet<unknown>(`/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}`, apiClients);
}

export async function getProposal(proposalId: string, apiClients: QueryClient = defaultClients): Promise<NormalizedProposal | null> {

  const v1 = await safeLcdGet<ProposalOneV1>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}`, apiClients);
  if (v1?.proposal) {
    return normalizeGovV1Proposal(v1.proposal);
  }

  const legacy = await safeLcdGet<ProposalOneV1Beta1>(`/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}`, apiClients
  );
  if (legacy?.proposal) {
    return normalizeGovV1Beta1Proposal(legacy.proposal);
  }

  return null;
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
      const value = response?.voting_params;
      if (!value?.voting_period) schemaError("Voting params 응답이 올바르지 않습니다.");
      return { votingPeriod: value.voting_period };
    }),
    tallying: safeLcdGet<ParamsTally>("/cosmos/gov/v1/params/tallying", apiClients).then(response => {
      const value = response?.tally_params;
      if (!value?.quorum || !value.threshold || !value.veto_threshold) schemaError("Tally params 응답이 올바르지 않습니다.");
      return { quorum: value.quorum, threshold: value.threshold, vetoThreshold: value.veto_threshold };
    }),
    deposit: safeLcdGet<ParamsDeposit>("/cosmos/gov/v1/params/deposit", apiClients).then(response => {
      const value = response?.deposit_params;
      if (!value || !Array.isArray(value.min_deposit)) schemaError("Deposit params 응답이 올바르지 않습니다.");
      return { minDeposit: value.min_deposit, maxDepositPeriod: value.max_deposit_period ?? "" };
    }),
  });
}

function mapVoteRows(res: VotesResponse | null): GovernanceVoteRow[] {
  const raw = res?.votes;
  if (!Array.isArray(raw)) {
    return [];
  }
  const rows: GovernanceVoteRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = normalizeVoteEntry(item as Record<string, unknown>);
    if (row) {
      rows.push(row);
    }
  }
  return rows;
}

export async function listVotes(proposalId: string, apiClients: QueryClient = defaultClients): Promise<GovernanceVoteRow[]> {

  const v1 = await safeLcdGet<VotesResponse>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}/votes?pagination.limit=200`, apiClients
  );
  const fromV1 = mapVoteRows(v1);
  if (v1) {
    return fromV1;
  }

  const legacy = await safeLcdGet<VotesResponse>(`/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}/votes?pagination.limit=200`, apiClients
  );
  return mapVoteRows(legacy);
}

function mapDepositRows(res: DepositsResponse | null): GovernanceDepositRow[] {
  const raw = res?.deposits;
  if (!Array.isArray(raw)) {
    return [];
  }
  const rows: GovernanceDepositRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = normalizeDepositEntry(item as Record<string, unknown>);
    if (row) {
      rows.push(row);
    }
  }
  return rows;
}

export async function listDeposits(proposalId: string, apiClients: QueryClient = defaultClients): Promise<GovernanceDepositRow[]> {

  const v1 = await safeLcdGet<DepositsResponse>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}/deposits`, apiClients
  );
  const fromV1 = mapDepositRows(v1);
  if (v1) {
    return fromV1;
  }

  const legacy = await safeLcdGet<DepositsResponse>(`/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}/deposits`, apiClients
  );
  return mapDepositRows(legacy);
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

  type AccountResp = {
    account?: {
      pub_key?: { key?: string };
    };
  };
  const res = await safeLcdGet<AccountResp>(`/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`, apiClients
  );
  const keyB64 = res?.account?.pub_key?.key;
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
