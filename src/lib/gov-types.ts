/** Normalized governance proposal (LCD v1 or v1beta1 merged). */
export type GovProposalStatus =
  | "deposit_period"
  | "voting_period"
  | "passed"
  | "rejected"
  | "failed"
  | "unspecified";

export type GovTally = {
  yes: string;
  abstain: string;
  no: string;
  noWithVeto: string;
};

export type GovCoin = {
  denom: string;
  amount: string;
};

export type NormalizedProposal = {
  id: string;
  title: string;
  /** Distinguish an app fallback from a real on-chain title with identical text. */
  titleMissing?: boolean;
  summary: string;
  status: GovProposalStatus;
  statusRaw: string;
  submitTime: string;
  depositEndTime: string;
  votingStartTime: string;
  votingEndTime: string;
  totalDeposit: GovCoin[];
  /** Final tally when voting ended; may be zeros during voting. */
  finalTally: GovTally;
};

export type GovVotingParams = {
  votingPeriod: string;
};

export type GovTallyParams = {
  quorum: string;
  threshold: string;
  vetoThreshold: string;
};

export type GovDepositParams = {
  minDeposit: GovCoin[];
  maxDepositPeriod: string;
};

export type GovParamsBundle = {
  voting: GovVotingParams | null;
  tallying: GovTallyParams | null;
  deposit: GovDepositParams | null;
};

export type VoteOption = "yes" | "no" | "abstain" | "no_with_veto";
