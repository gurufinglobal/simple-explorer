import type {
  GovCoin,
  GovProposalStatus,
  GovTally,
  NormalizedProposal,
} from "@/lib/gov-types";

function mapStatus(raw: string): GovProposalStatus {
  switch (raw) {
    case "PROPOSAL_STATUS_DEPOSIT_PERIOD":
      return "deposit_period";
    case "PROPOSAL_STATUS_VOTING_PERIOD":
      return "voting_period";
    case "PROPOSAL_STATUS_PASSED":
      return "passed";
    case "PROPOSAL_STATUS_REJECTED":
      return "rejected";
    case "PROPOSAL_STATUS_FAILED":
      return "failed";
    default:
      return "unspecified";
  }
}

function mapTally(tally: unknown): GovTally {
  if (!tally || typeof tally !== "object") {
    return { yes: "0", abstain: "0", no: "0", noWithVeto: "0" };
  }
  const t = tally as Record<string, string | undefined>;
  return {
    yes: t.yes_count ?? t.yes ?? "0",
    abstain: t.abstain_count ?? t.abstain ?? "0",
    no: t.no_count ?? t.no ?? "0",
    noWithVeto: t.no_with_veto_count ?? t.no_with_veto ?? "0",
  };
}

function mapCoins(raw: unknown): GovCoin[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((c) => {
    const o = c as { denom?: string; amount?: string };
    return { denom: o.denom ?? "", amount: o.amount ?? "0" };
  });
}

/** Normalize v1 proposal object from LCD. */
export function normalizeGovV1Proposal(p: Record<string, unknown>): NormalizedProposal {
  const id = String(p.id ?? "");
  const statusRaw = String(p.status ?? "");
  const messages = Array.isArray(p.messages) ? (p.messages as unknown[]) : [];
  let title = String(p.title ?? "");
  let summary = String(p.summary ?? "");

  if (!title && messages.length > 0) {
    const first = messages[0] as Record<string, unknown>;
    const val = first?.value as Record<string, unknown> | undefined;
    if (val?.title) {
      title = String(val.title);
    }
    if (val?.description) {
      summary = String(val.description);
    }
  }

  return {
    id,
    title: title || `Proposal ${id}`,
    summary: summary || "—",
    status: mapStatus(statusRaw),
    statusRaw,
    submitTime: String(p.submit_time ?? ""),
    depositEndTime: String(p.deposit_end_time ?? ""),
    votingStartTime: String(p.voting_start_time ?? ""),
    votingEndTime: String(p.voting_end_time ?? ""),
    totalDeposit: mapCoins(p.total_deposit),
    finalTally: mapTally(p.final_tally_result),
  };
}

/** Normalize v1beta1 proposal object from LCD. */
export function normalizeGovV1Beta1Proposal(p: Record<string, unknown>): NormalizedProposal {
  const id = String(p.proposal_id ?? p.id ?? "");
  const statusRaw = String(p.status ?? "");
  const content = p.content as Record<string, unknown> | undefined;
  const title =
    String(p.title ?? "") ||
    (content?.title ? String(content.title) : "") ||
    `Proposal ${id}`;
  const summary =
    String(p.description ?? "") || (content?.description ? String(content.description) : "") || "—";

  return {
    id,
    title,
    summary,
    status: mapStatus(statusRaw),
    statusRaw,
    submitTime: String(p.submit_time ?? ""),
    depositEndTime: String(p.deposit_end_time ?? ""),
    votingStartTime: String(p.voting_start_time ?? ""),
    votingEndTime: String(p.voting_end_time ?? ""),
    totalDeposit: mapCoins(p.total_deposit),
    finalTally: mapTally(p.final_tally_result),
  };
}

export function tallyPercentages(tally: GovTally): { yes: number; abstain: number; no: number; veto: number } {
  const y = BigInt(tally.yes || "0");
  const a = BigInt(tally.abstain || "0");
  const n = BigInt(tally.no || "0");
  const v = BigInt(tally.noWithVeto || "0");
  const total = y + a + n + v;
  const zero = BigInt(0);
  const tenThousand = BigInt(10000);
  if (total === zero) {
    return { yes: 0, abstain: 0, no: 0, veto: 0 };
  }
  const pct = (part: bigint) => Number((part * tenThousand) / total) / 100;
  return {
    yes: pct(y),
    abstain: pct(a),
    no: pct(n),
    veto: pct(v),
  };
}
