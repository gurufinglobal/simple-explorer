/**
 * Governance write operations are implemented in `governance-tx.client.ts` (browser-only).
 * Import `submitGovernanceVoteTx`, `submitGovernanceDepositTx`, `submitTextProposalTx` from there in client components.
 */
export type { VoteOption as GovernanceVoteOption } from "@/lib/gov-types";
