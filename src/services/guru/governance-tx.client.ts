"use client";
import { serviceText, ServiceError } from '@/i18n/service-message';

import { bech32 } from "bech32";
import { z } from "zod";
import { Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";
import { MsgDeposit, MsgExecLegacyContent, MsgSubmitProposal, MsgVote } from "cosmjs-types/cosmos/gov/v1/tx";
import { TextProposal } from "cosmjs-types/cosmos/gov/v1beta1/gov";
import { assertBaseAmount, displayToBase } from "@/lib/cosmos-amount";
import type { ChainConfig } from "@/lib/env";
import type { VoteOption } from "@/lib/gov-types";
import { prepareTransaction } from "@/services/transactions/prepare";
import type { GovernanceAction } from "@/services/transactions/transaction";
import type { SigningInput } from "@/services/wallet/signing-context";
import { getAddressAccountInfo, getSpendableBalances } from "./address-profile.service";
import { getGovModuleAddress } from "./governance-query.service";
import { getDenomsMetadata } from "./token-metadata.service";

export const governanceMessages = {
  vote: { typeUrl: "/cosmos.gov.v1.MsgVote", label: serviceText("vote") },
  deposit: { typeUrl: "/cosmos.gov.v1.MsgDeposit", label: serviceText("deposit") },
  proposal: { typeUrl: "/cosmos.gov.v1.MsgSubmitProposal", label: serviceText("text_proposal") },
} as const;
export type GovernanceTxInput = SigningInput & (
  | { action: "vote"; proposalId: string; option: VoteOption }
  | { action: "deposit"; proposalId: string; amount: string; denom: string; displayAmount?: string }
  | { action: "proposal"; title: string; summary: string; description: string; amount: string; denom: string; displayAmount?: string }
);
const options: Record<VoteOption, number> = { yes: 1, abstain: 2, no: 3, no_with_veto: 4 };
export function canonicalProposalId(id: string): boolean {
  return /^[1-9]\d*$/.test(id) && id.length <= 20 && BigInt(id) <= BigInt("18446744073709551615");
}
export function governanceBlockReason(chain: ChainConfig, action: GovernanceAction, wallet: SigningInput["walletType"] | null): string | null {
  if (chain.features?.governance !== true) return serviceText("governance_module_support_is_unverified_sending_is_blocked");
  const capability = chain.governanceCapabilities?.[action];
  if (!capability || capability.typeUrl !== governanceMessages[action]?.typeUrl) return serviceText("no_verified_support_for_this_governance_message_or_its_fees");
  if (wallet === "walletconnect") return serviceText("the_installed_cosmjs_does_not_support_gov_v1_amino_conversion");
  if (!capability.signing.some(s => s.wallet === wallet && s.method === "direct" && chain.signing?.some(c => c.wallet === wallet && c.method === "direct"))) return serviceText("direct_signing_for_this_governance_message_is_unverified_gov_v1");
  if (action === "proposal" && !chain.governanceCapabilities?.proposal?.legacyContent?.evidence) return serviceText("no_verified_support_for_this_chain_s_legacy_textproposal_handler");
  return null;
}
const coins = z.array(z.object({ denom: z.string().min(1), amount: z.string().regex(/^[1-9]\d*$/) })).min(1);
const stable = (value: unknown): string => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

/** Preparation is the only write entry point. execute is returned only after all read/fee checks. */
export async function prepareGovernanceTx(input: GovernanceTxInput, assertInputCurrent: () => void = () => {}) {
  const params = { ...input };
  if (!(params.action in governanceMessages)) throw new ServiceError("unsupported_governance_action");
  if (params.action !== "proposal" && !canonicalProposalId(params.proposalId)) throw new ServiceError("proposal_id_must_be_a_positive_canonical_uint64_integer");
  if (params.action === "vote" && !Object.hasOwn(options, params.option)) throw new ServiceError("check_the_selected_vote_option");
  if (params.action !== "vote") {
    assertBaseAmount(params.amount);
    if (!params.denom) throw new ServiceError("deposit_denom_unknown");
  }
  if (params.action === "proposal" && (!params.title.trim() || !params.summary.trim() || !params.description.trim())) throw new ServiceError("enter_a_title_summary_and_description");
  return prepareTransaction(params, async ({ chain, query, sender, assertCurrent }) => {
    const reason = governanceBlockReason(chain, params.action, params.walletType);
    if (reason) throw new Error(reason);
    const capability = chain.governanceCapabilities![params.action]!;
    let baseline: string | undefined;
    let authority: string | null = null;
    let periodEnd = Infinity;
    let depositPolicy = "";
    const assertPeriod = () => { if (Date.now() >= periodEnd) throw new ServiceError("the_proposal_period_has_ended_check_its_status_again"); };
    const readState = async () => {
      // Raw params retain policy fields (including SDK-version-specific ratios).
      // No legacy fallback for v1 writes: a successful v1beta1 read cannot grant v1 signing.
      const [depositResponse, votingResponse, tallyResponse, account, proposalResponse, moduleAddress] = await Promise.all([
        query.lcdGet<unknown>("/cosmos/gov/v1/params/deposit"),
        query.lcdGet<unknown>("/cosmos/gov/v1/params/voting"),
        query.lcdGet<unknown>("/cosmos/gov/v1/params/tallying"),
        getAddressAccountInfo(sender, query),
        params.action === "proposal" ? Promise.resolve(null) : query.lcdGet<unknown>(`/cosmos/gov/v1/proposals/${params.proposalId}`),
        params.action === "proposal" ? getGovModuleAddress(query) : Promise.resolve(null),
      ]);
      assertCurrent();
      if (!/^\d+$/.test(account.accountNumber ?? "") || !/^\d+$/.test(account.sequence ?? "")) throw new ServiceError("signing_account_permissions_or_sequence_unknown");
      const deposit = z.object({ params: z.object({ min_deposit: coins }).passthrough().optional(), deposit_params: z.object({ min_deposit: coins }).passthrough().optional() }).parse(depositResponse);
      const minimum = (deposit.params ?? deposit.deposit_params)?.min_deposit;
      if (!minimum) throw new ServiceError("current_minimum_deposit_parameters_unknown");
      const voting = z.object({ params: z.object({ voting_period: z.string().min(1) }).passthrough().optional(), voting_params: z.object({ voting_period: z.string().min(1) }).passthrough().optional() }).parse(votingResponse);
      const tallyFields = z.object({ quorum: z.string().min(1), threshold: z.string().min(1), veto_threshold: z.string().min(1) }).passthrough();
      const tally = z.object({ params: tallyFields.optional(), tally_params: tallyFields.optional() }).parse(tallyResponse);
      if (!(voting.params ?? voting.voting_params) || !(tally.params ?? tally.tally_params)) throw new ServiceError("current_governance_parameters_unknown");
      let proposalState: unknown = null;
      if (params.action !== "proposal") {
        const timestamp = z.string().nullable().optional();
        const proposal = z.object({ proposal: z.object({ id: z.string(), status: z.string(), deposit_end_time: timestamp, voting_start_time: timestamp, voting_end_time: timestamp }) }).parse(proposalResponse).proposal;
        if (proposal.id !== params.proposalId) throw new ServiceError("queried_proposal_id_differs_from_the_transaction_target");
        const expected = params.action === "vote" ? "PROPOSAL_STATUS_VOTING_PERIOD" : "PROPOSAL_STATUS_DEPOSIT_PERIOD";
        if (proposal.status !== expected) throw new ServiceError("proposal_status_changed_or_does_not_permit_this_action");
        periodEnd = Date.parse((params.action === "vote" ? proposal.voting_end_time : proposal.deposit_end_time) ?? "");
        const start = params.action === "vote" ? Date.parse(proposal.voting_start_time ?? "") : -Infinity;
        if (!Number.isFinite(periodEnd) || (params.action === "vote" && (!Number.isFinite(start) || Date.now() < start))) throw new ServiceError("the_proposal_period_is_unknown_or_has_not_started");
        assertPeriod();
        proposalState = proposal;
      }
      if (params.action !== "vote") {
        if (minimum.length !== 1 || minimum[0].denom !== params.denom) throw new ServiceError("denom_differs_from_the_current_minimum_deposit_or_the_multi");
        depositPolicy = serviceText("app_deposit_policy_at_least_the_full_current_minimum_single", { value0: String(minimum[0].amount), value1: String(minimum[0].denom) });
        // Conservative app policy: full current minimum, not an inferred initial/minimum ratio.
        if (BigInt(params.amount) < BigInt(minimum[0].amount)) throw new ServiceError("app_deposit_policy_enter_at_least_the_full_current_minimum", { value0: String(minimum[0].amount), value1: String(minimum[0].denom) });
      }
      if (params.action === "proposal") {
        const expected = chain.governanceCapabilities!.proposal!.legacyContent!.authority;
        if (!moduleAddress || moduleAddress !== expected) throw new ServiceError("current_gov_authority_differs_from_the_verified_legacy_content_configuration");
        const decoded = bech32.decode(moduleAddress);
        if (decoded.prefix !== chain.bech32Prefix || bech32.fromWords(decoded.words).length !== 20) throw new ServiceError("gov_authority_address_format_mismatch");
        authority = moduleAddress;
      }
      const fingerprint = stable({ depositResponse, votingResponse, tallyResponse, proposalState, moduleAddress, accountNumber: account.accountNumber });
      if (baseline !== undefined && baseline !== fingerprint) throw new ServiceError("proposal_status_period_parameters_or_account_permissions_changed_review_again");
      baseline = fingerprint;
    };
    await readState();
    let displayAmount: string | undefined;
    let unit: string | undefined;
    if (params.action !== "vote") {
      const metadata = (await getDenomsMetadata(query)).find(m => m.baseDenom === params.denom);
      assertCurrent();
      if (metadata?.decimals == null) throw new ServiceError("display_precision_unknown_cannot_verify_the_deposit_amount");
      const padded = params.amount.padStart(metadata.decimals + 1, "0");
      displayAmount = params.displayAmount ?? (metadata.decimals ? `${padded.slice(0, -metadata.decimals)}.${padded.slice(-metadata.decimals)}` : params.amount);
      if (displayToBase(displayAmount, metadata.decimals) !== params.amount) throw new ServiceError("display_amount_differs_from_the_raw_deposit_amount");
      unit = metadata.symbol || metadata.displayDenom;
    }
    const amount = params.action === "vote" ? [] : [{ amount: params.amount, denom: params.denom }];
    const value = params.action === "vote" ? MsgVote.fromPartial({ proposalId: BigInt(params.proposalId), voter: sender, option: options[params.option] })
      : params.action === "deposit" ? MsgDeposit.fromPartial({ proposalId: BigInt(params.proposalId), depositor: sender, amount })
      : MsgSubmitProposal.fromPartial({ title: params.title, summary: params.summary, proposer: sender, initialDeposit: amount, messages: [{
        typeUrl: "/cosmos.gov.v1.MsgExecLegacyContent", value: MsgExecLegacyContent.encode(MsgExecLegacyContent.fromPartial({ authority: authority!, content: {
          typeUrl: "/cosmos.gov.v1beta1.TextProposal", value: TextProposal.encode(TextProposal.fromPartial({ title: params.title, description: params.description })).finish(),
        } })).finish(),
      }] });
    const message = { typeUrl: governanceMessages[params.action].typeUrl, value };
    // Use the same default registry as the actual SigningStargateClient, not a synthetic serializer.
    new Registry(defaultRegistryTypes).encode(message);
    return {
      message, policy: capability.fee,
      assertValid: assertPeriod,
      allowedSigning: capability.signing.filter(s => s.method === "direct" && s.wallet === "keplr"),
      governance: Object.freeze({ action: params.action, ...(params.action !== "proposal" ? { proposalId: params.proposalId } : {}) }),
      display: { action: governanceMessages[params.action].label, recipient: params.action === "proposal" ? authority! : params.proposalId,
        targetLabel: params.action === "proposal" ? "Gov authority" : serviceText("full_proposal_id"),
        ...(params.action !== "vote" ? { amount: params.amount, denom: params.denom, displayAmount, unit } : {}),
        governance: Object.freeze({ ...(params.action === "vote" ? { option: params.option } : { depositPolicy }),
          ...(params.action === "proposal" ? { title: params.title, summary: params.summary, description: params.description } : {}) }),
      },
      check: async (fee: import("@cosmjs/amino").StdFee) => {
        await readState();
        const balances = await getSpendableBalances(sender, query);
        assertCurrent(); assertPeriod();
        const required = new Map<string, bigint>();
        for (const coin of [...amount, ...fee.amount]) required.set(coin.denom, (required.get(coin.denom) ?? BigInt(0)) + BigInt(coin.amount));
        for (const [denom, requiredAmount] of required) {
          const available = balances.filter(c => c.denom === denom).reduce((sum, c) => sum + BigInt(c.amount), BigInt(0));
          if (available < requiredAmount) throw new ServiceError("insufficient_spendable_balance_check_the_combined_deposit_and_fee_balance", { value0: String(denom) });
        }
      },
    };
  }, assertInputCurrent);
}
