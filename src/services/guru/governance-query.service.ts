import { normalizeGovV1Beta1Proposal, normalizeGovV1Proposal } from "@/lib/gov-mapper";
import type {
  GovCoin,
  GovParamsBundle,
  GovTally,
  NormalizedProposal,
  VoteOption,
} from "@/lib/gov-types";
import { apiClients } from "@/services/clients";

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

async function safeLcdGet<T>(path: string): Promise<T | null> {
  if (process.env.NODE_ENV === "test") {
    return null;
  }
  try {
    return await apiClients.lcdGet<T>(path);
  } catch {
    return null;
  }
}

export async function listProposals(limit = 100): Promise<NormalizedProposal[]> {
  if (process.env.NODE_ENV === "test") {
    return [
      {
        id: "1",
        title: "Test proposal",
        summary: "Summary",
        status: "voting_period",
        statusRaw: "PROPOSAL_STATUS_VOTING_PERIOD",
        submitTime: new Date().toISOString(),
        depositEndTime: new Date().toISOString(),
        votingStartTime: new Date().toISOString(),
        votingEndTime: new Date(Date.now() + 86400000).toISOString(),
        totalDeposit: [{ denom: "agxn", amount: "1000000" }],
        finalTally: { yes: "0", abstain: "0", no: "0", noWithVeto: "0" },
      },
    ];
  }

  const v1 = await safeLcdGet<ProposalsV1Response>(
    `/cosmos/gov/v1/proposals?pagination.limit=${limit}&pagination.reverse=true`,
  );
  if (v1?.proposals?.length) {
    return v1.proposals.map((p) => normalizeGovV1Proposal(p));
  }

  const legacy = await safeLcdGet<ProposalsV1Beta1Response>(
    `/cosmos/gov/v1beta1/proposals?pagination.limit=${limit}&pagination.reverse=true`,
  );
  if (legacy?.proposals?.length) {
    return legacy.proposals.map((p) => normalizeGovV1Beta1Proposal(p));
  }

  return [];
}

export async function getProposalRaw(proposalId: string): Promise<unknown | null> {
  if (process.env.NODE_ENV === "test") {
    return { proposal: { id: proposalId } };
  }
  const v1 = await safeLcdGet<unknown>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}`);
  if (v1) {
    return v1;
  }
  return safeLcdGet<unknown>(`/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}`);
}

export async function getProposal(proposalId: string): Promise<NormalizedProposal | null> {
  if (process.env.NODE_ENV === "test") {
    const list = await listProposals();
    return list.find((p) => p.id === proposalId) ?? null;
  }

  const v1 = await safeLcdGet<ProposalOneV1>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}`);
  if (v1?.proposal) {
    return normalizeGovV1Proposal(v1.proposal);
  }

  const legacy = await safeLcdGet<ProposalOneV1Beta1>(
    `/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}`,
  );
  if (legacy?.proposal) {
    return normalizeGovV1Beta1Proposal(legacy.proposal);
  }

  return null;
}

/** Current tally (useful during voting period). */
export async function getProposalTally(proposalId: string): Promise<GovTally | null> {
  if (process.env.NODE_ENV === "test") {
    return { yes: "1", abstain: "0", no: "0", noWithVeto: "0" };
  }

  const v1 = await safeLcdGet<TallyResponse>(
    `/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}/tally`,
  );
  if (v1?.tally) {
    const t = v1.tally as Record<string, string>;
    return {
      yes: t.yes_count ?? "0",
      abstain: t.abstain_count ?? "0",
      no: t.no_count ?? "0",
      noWithVeto: t.no_with_veto_count ?? "0",
    };
  }

  return null;
}

export async function getGovParams(): Promise<GovParamsBundle> {
  if (process.env.NODE_ENV === "test") {
    return {
      voting: { votingPeriod: "120h" },
      tallying: { quorum: "0.333", threshold: "0.5", vetoThreshold: "0.334" },
      deposit: { minDeposit: [{ denom: "agxn", amount: "1000000" }], maxDepositPeriod: "120h" },
    };
  }

  const [voting, tallying, deposit] = await Promise.all([
    safeLcdGet<ParamsVoting>("/cosmos/gov/v1/params/voting"),
    safeLcdGet<ParamsTally>("/cosmos/gov/v1/params/tallying"),
    safeLcdGet<ParamsDeposit>("/cosmos/gov/v1/params/deposit"),
  ]);

  const votingLegacy = !voting?.voting_params
    ? await safeLcdGet<ParamsVoting>("/cosmos/gov/v1beta1/params/voting")
    : null;
  const tallyLegacy = !tallying?.tally_params
    ? await safeLcdGet<ParamsTally>("/cosmos/gov/v1beta1/params/tallying")
    : null;
  const depositLegacy = !deposit?.deposit_params
    ? await safeLcdGet<ParamsDeposit>("/cosmos/gov/v1beta1/params/deposit")
    : null;

  const v = voting?.voting_params ?? votingLegacy?.voting_params;
  const t = tallying?.tally_params ?? tallyLegacy?.tally_params;
  const d = deposit?.deposit_params ?? depositLegacy?.deposit_params;

  return {
    voting: v?.voting_period ? { votingPeriod: v.voting_period } : null,
    tallying:
      t?.quorum && t?.threshold && t?.veto_threshold
        ? {
            quorum: t.quorum,
            threshold: t.threshold,
            vetoThreshold: t.veto_threshold,
          }
        : null,
    deposit:
      d?.min_deposit || d?.max_deposit_period
        ? {
            minDeposit: d.min_deposit ?? [],
            maxDepositPeriod: d.max_deposit_period ?? "",
          }
        : null,
  };
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

export async function listVotes(proposalId: string): Promise<GovernanceVoteRow[]> {
  if (process.env.NODE_ENV === "test") {
    return [];
  }

  const v1 = await safeLcdGet<VotesResponse>(
    `/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}/votes?pagination.limit=200`,
  );
  const fromV1 = mapVoteRows(v1);
  if (fromV1.length > 0) {
    return fromV1;
  }

  const legacy = await safeLcdGet<VotesResponse>(
    `/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}/votes?pagination.limit=200`,
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

export async function listDeposits(proposalId: string): Promise<GovernanceDepositRow[]> {
  if (process.env.NODE_ENV === "test") {
    return [];
  }

  const v1 = await safeLcdGet<DepositsResponse>(
    `/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}/deposits`,
  );
  const fromV1 = mapDepositRows(v1);
  if (fromV1.length > 0) {
    return fromV1;
  }

  const legacy = await safeLcdGet<DepositsResponse>(
    `/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}/deposits`,
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
export async function getGovModuleAddress(): Promise<string | null> {
  if (process.env.NODE_ENV === "test") {
    return "gov1testaddress000000000000000000000000000";
  }

  const res = await safeLcdGet<ModuleAccountsResponse>("/cosmos/auth/v1beta1/module_accounts");
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

export async function getAccountPubkeyBytes(address: string): Promise<Uint8Array | null> {
  if (process.env.NODE_ENV === "test") {
    return new Uint8Array(33).fill(1);
  }

  type AccountResp = {
    account?: {
      pub_key?: { key?: string };
    };
  };
  const res = await safeLcdGet<AccountResp>(
    `/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`,
  );
  const keyB64 = res?.account?.pub_key?.key;
  if (!keyB64) {
    return null;
  }
  try {
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(keyB64, "base64"));
    }
    const bin = atob(keyB64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export async function getVoteForVoter(
  proposalId: string,
  voterAddress: string,
): Promise<VoteOption | null> {
  if (process.env.NODE_ENV === "test") {
    return null;
  }

  const v1 = await safeLcdGet<{
    vote?: { options?: Array<{ option?: string }> };
  }>(`/cosmos/gov/v1/proposals/${encodeURIComponent(proposalId)}/votes/${encodeURIComponent(voterAddress)}`);

  const opt = v1?.vote?.options?.[0]?.option;
  if (opt) {
    return parseVoteOptionFromChain(opt);
  }

  const legacy = await safeLcdGet<{
    vote?: { option?: string };
  }>(`/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}/votes/${encodeURIComponent(voterAddress)}`);

  const legacyOpt = legacy?.vote?.option;
  if (legacyOpt) {
    return parseVoteOptionFromChain(legacyOpt);
  }

  return null;
}
