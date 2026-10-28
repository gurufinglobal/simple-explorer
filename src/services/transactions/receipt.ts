import { clearLiveTransactionCache } from '../guru/live-history.service';
import serviceTemplates from "@/i18n/service-messages.json";

import { describeServiceMessage, ServiceError, serviceText, type ServiceCode } from '@/i18n/service-message';
import { z } from "zod";
import { bech32 } from "bech32";
import { getDelegatorValidatorPosition, getValidatorDetail, getTopValidators } from "@/services/guru/staking.service";
import { getWalletPortfolio } from "@/services/guru/wallet-portfolio.service";
import { getChainByKey } from "@/lib/env";
import { getActiveChainConfig } from "@/lib/chain-selection";
import { invalidateQueryReads, requestJson, createQueryClient } from "@/services/clients";
import { verifyLcdChain } from "@/services/wallet/chain-eligibility";
import { getAddressBalances } from "@/services/guru/address-profile.service";
import { getTransactionsByAddress } from "@/services/guru/transactions.service";
import { useWalletSessionStore } from "@/stores/wallet-session.store";
import { useWalletPortfolioStore } from "@/stores/wallet-portfolio.store";
import { errorMessage, type TransactionReceipt } from "./transaction";
import { getProposal, getProposalRaw, getProposalTally, getVoteForVoter, listDeposits, listProposals, listVotes } from "@/services/guru/governance-query.service";

const coin = z.object({ amount: z.string().regex(/^\d+$/), denom: z.string().min(1) });
const proposalId = z.string().regex(/^[1-9]\d*$/).max(20).refine(id => BigInt(id) <= BigInt("18446744073709551615"));
const receiptSchema = z.object({
  chainKey: z.string(), chainId: z.string(), sender: z.string(), hash: z.string().regex(/^[A-Fa-f0-9]{64}$/).nullable(),
  status: z.enum(["pending", "success", "failed", "cancelled"]), message: z.string(),
  messageCode: z.custom<ServiceCode>(value => typeof value === "string" && Object.hasOwn(serviceTemplates, value)).optional(),
  messageParams: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  staking: z.object({ action: z.enum(["delegate", "undelegate", "reward", "commission"]), validator: z.string().min(1) }).optional(),
  governance: z.discriminatedUnion("action", [
    z.object({ action: z.literal("vote"), proposalId }),
    z.object({ action: z.literal("deposit"), proposalId }),
    z.object({ action: z.literal("proposal"), proposalId: proposalId.optional() }),
  ]).optional(),
  proposalIdWarning: z.string().optional(),
  code: z.number().int().optional(), estimatedFee: z.array(coin), actualFee: z.array(coin).nullable(), feeWarning: z.string().optional(), queryError: z.string().optional(),
});
const storageKey = "explorer:transaction-receipts:v1";
export const receiptEvent = "explorer:transaction-receipts";
export function loadReceipts(): TransactionReceipt[] {
  try {
    const parsed = z.array(receiptSchema).safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
    return parsed.success ? parsed.data.slice(-20) : [];
  } catch { return []; }
}
export function storedReceipt(receipt: TransactionReceipt): TransactionReceipt | undefined {
  return receipt.hash ? loadReceipts().find(r => r.chainKey === receipt.chainKey && r.chainId === receipt.chainId && r.hash === receipt.hash) : undefined;
}
/** Pending observations cannot retract a known outcome for the same transaction. */
export function mergeReceiptUpdate(current: TransactionReceipt, next: TransactionReceipt): TransactionReceipt {
  return current.chainKey === next.chainKey && current.chainId === next.chainId && current.hash === next.hash
    && next.status === "pending" && (current.status === "success" || current.status === "failed") ? current : next;
}
/** Store public chain/hash/result data, never signed bytes or wallet session material. */
export function saveReceipt(receipt: TransactionReceipt): boolean {
  if (!receipt.hash) return false;
  try {
    // A delayed timeout/pending writer cannot erase observed execution evidence.
    const current = storedReceipt(receipt);
    if (current && mergeReceiptUpdate(current, receipt) === current) return true;
    const records = loadReceipts().filter(r => r.chainKey !== receipt.chainKey || r.hash !== receipt.hash);
    localStorage.setItem(storageKey, JSON.stringify([...records, receipt].slice(-20)));
    window.dispatchEvent(new Event(receiptEvent));
    return true;
  } catch { return false; }
}
function receiptChain(receipt: TransactionReceipt) {
  const chain = getChainByKey(receipt.chainKey);
  if (!chain || chain.chainId !== receipt.chainId) throw new ServiceError("transaction_chain_configuration_changed_or_is_missing_check_the_original");
  if (receipt.staking) {
    const decoded = bech32.decode(receipt.staking.validator);
    if (decoded.prefix !== `${chain.bech32Prefix}valoper` || bech32.fromWords(decoded.words).length !== 20) throw new ServiceError("saved_validator_address_differs_from_the_original_chain");
  }
  return chain;
}
/** Only the included transaction's submit_proposal event identifies the new proposal. */
export function proposalIdFromTx(raw: unknown, sender: string): string | null {
  const parsed = z.object({
    tx: z.object({ body: z.object({ messages: z.array(z.object({ "@type": z.string(), proposer: z.string().optional() })).length(1) }) }),
    tx_response: z.object({ events: z.unknown().optional(), logs: z.unknown().optional() }),
  }).safeParse(raw);
  if (!parsed.success) return null;
  const message = parsed.data.tx.body.messages[0];
  if (message["@type"] !== "/cosmos.gov.v1.MsgSubmitProposal" || message.proposer !== sender) return null;
  const eventSchema = z.array(z.object({ type: z.string(), attributes: z.array(z.object({ key: z.string(), value: z.string() })) }));
  const events = eventSchema.safeParse(parsed.data.tx_response.events);
  const logs = z.array(z.object({ events: eventSchema })).safeParse(parsed.data.tx_response.logs);
  if (parsed.data.tx_response.events !== undefined && !events.success) return null;
  if (parsed.data.tx_response.logs !== undefined && !logs.success) return null;
  const all = [...(events.success ? events.data : []), ...(logs.success ? logs.data.flatMap(l => l.events) : [])];
  const values = all.filter(e => e.type === "submit_proposal").flatMap(e => e.attributes.filter(a => a.key === "proposal_id").map(a => a.value));
  if (!values.length || values.some(id => !proposalId.safeParse(id).success) || new Set(values).size !== 1) return null;
  return values[0];
}
/** Missing/malformed raw fee is not zero and is never replaced by the estimate. */
export async function queryReceipt(receipt: TransactionReceipt): Promise<TransactionReceipt> {
  const stored = storedReceipt(receipt);
  receipt = stored ? mergeReceiptUpdate(receipt, stored) : receipt;
  // Storage may advance while HTTP is in flight, even if the result UI unmounts.
  const reconcile = (next: TransactionReceipt) => {
    const current = storedReceipt(receipt);
    return current && JSON.stringify(current) !== JSON.stringify(stored) ? mergeReceiptUpdate(receipt, current) : next;
  };
  try {
    const chain = receiptChain(receipt);
    if (!receipt.hash || !/^[a-fA-F0-9]{64}$/.test(receipt.hash)) throw new ServiceError("cannot_query_transaction_status_without_a_hash");
    await verifyLcdChain(chain);
    const raw = await requestJson<unknown>(`${chain.lcdUrl.replace(/\/$/, "")}/cosmos/tx/v1beta1/txs/${receipt.hash}`);
    const response = z.object({
      tx_response: z.object({ txhash: z.string(), code: z.number().int().nonnegative(), height: z.string().regex(/^[1-9]\d*$/), raw_log: z.string().optional() }),
      tx: z.object({ auth_info: z.object({ fee: z.object({ amount: z.unknown().optional() }).optional() }).optional() }).optional(),
    }).parse(raw);
    if (response.tx_response.txhash.toUpperCase() !== receipt.hash.toUpperCase()) throw new ServiceError("queried_transaction_hash_differs_from_the_requested_hash");
    const parsedFee = z.array(coin).safeParse(response.tx?.auth_info?.fee?.amount);
    const actualFee = parsedFee.success ? parsedFee.data : null;
    const normalized = (coins: typeof actualFee) => JSON.stringify(coins?.map(c => `${c.denom}:${BigInt(c.amount)}`).sort());
    const feeWarning = actualFee === null ? serviceText("actual_raw_fee_not_retrieved_or_format_mismatch")
      : normalized(actualFee) !== normalized(receipt.estimatedFee) ? serviceText("actual_chain_fee_differs_from_the_app_s_estimated_fee") : undefined;
    const submittedId = receipt.governance?.action === "proposal" && response.tx_response.code === 0 ? proposalIdFromTx(raw, receipt.sender) : null;
    const governance = receipt.governance?.action === "proposal" && response.tx_response.code === 0
      ? { action: "proposal" as const, ...(submittedId ? { proposalId: submittedId } : {}) } : receipt.governance;
    const message = response.tx_response.code === 0 ? serviceText("included_successfully_on_chain") : response.tx_response.raw_log || serviceText("chain_execution_failed_code_2", { value0: String(response.tx_response.code) });
    const descriptor = describeServiceMessage(message);
    return reconcile({ ...receipt, status: response.tx_response.code === 0 ? "success" : "failed",
      governance,
      proposalIdWarning: receipt.governance?.action === "proposal" && response.tx_response.code === 0 && !submittedId
        ? serviceText("transaction_included_successfully_but_the_new_proposal_id_is_unknown") : undefined,
      code: response.tx_response.code, actualFee, feeWarning, queryError: undefined,
      message, messageCode: descriptor?.messageCode, messageParams: descriptor?.messageParams });
  } catch (error) {
    return reconcile({ ...receipt, queryError: serviceText("transaction_detail_refresh_failed", { value0: String(errorMessage(error)) }) });
  }
}

export async function refreshTransactionReads(receipt: TransactionReceipt): Promise<string[]> {
  const chain = receiptChain(receipt);
  invalidateQueryReads(chain);
  clearLiveTransactionCache();
  const client = createQueryClient(chain);
  const jobs: [string, string, () => Promise<unknown>][] = [
    [serviceText("sender_balance"), `balances:${receipt.sender}`, () => getAddressBalances(receipt.sender, client)],
    [serviceText("address_transactions"), `address-transactions:${receipt.sender}`, () => getTransactionsByAddress(receipt.sender, 30, client)],
  ];
  const staking = receipt.staking;
  const gov = receipt.governance;
  if (gov) {
    if (gov.action === "proposal") jobs.push([serviceText("proposal_list"), "governance", () => listProposals(100, client)]);
    if (gov.proposalId) {
      const id = gov.proposalId;
      jobs.push([serviceText("proposal_status_and_total_deposit"), `proposal:${id}`, () => getProposal(id, client)], [serviceText("original_proposal"), `proposal-raw:${id}`, () => getProposalRaw(id, client)]);
      if (gov.action === "vote") jobs.push(
        [serviceText("my_vote"), `my-vote:${id}:${receipt.sender}`, () => getVoteForVoter(id, receipt.sender, client)],
        [serviceText("vote_tally"), `tally:${id}`, () => getProposalTally(id, client)],
        [serviceText("vote_list"), `votes:${id}`, () => listVotes(id, client)],
      );
      if (gov.action === "deposit") jobs.push([serviceText("deposit_list"), `deposits:${id}`, () => listDeposits(id, client)]);
    }
  }
  if (staking) jobs.push(
    [serviceText("my_delegation_position"), `delegator:${receipt.sender}:${staking.validator}`, () => getDelegatorValidatorPosition(receipt.sender, staking.validator, client)],
    [serviceText("assets_rewards_and_unbonding"), `address-portfolio:${receipt.sender}`, () => getWalletPortfolio(receipt.sender, client)],
    [serviceText("validator_details"), `staking:${staking.validator}`, () => getValidatorDetail(staking.validator, client)],
    [serviceText("validator_list"), "staking", () => getTopValidators(100, client)],
  );
  if (getActiveChainConfig().key === chain.key && useWalletSessionStore.getState().bech32Address === receipt.sender) {
    const duplicate = jobs.findIndex(([, target]) => target === `address-portfolio:${receipt.sender}`);
    if (duplicate >= 0) jobs.splice(duplicate, 1);
    jobs.push([serviceText("wallet_assets"), "wallet-assets-store", async () => {
      const portfolio = useWalletPortfolioStore.getState();
      portfolio.clear();
      await portfolio.refresh(receipt.sender);
      const result = useWalletPortfolioStore.getState().result;
      if (result.context.chain === chain.key && result.context.target === `portfolio:${receipt.sender}` && result.status !== "success") {
        throw new Error(result.error?.message ?? serviceText("some_assets_could_not_be_queried"));
      }
    }]);
  }
  const claimed = new Set<string>();
  const refreshes: Promise<void>[] = [];
  window.dispatchEvent(new CustomEvent("explorer:queries-invalidated", { detail: {
    chain: chain.key, claimed, refreshes,
    targets: [`balances:${receipt.sender}`, `address-transactions:${receipt.sender}`, `address-portfolio:${receipt.sender}`, `transaction:${receipt.hash}`, ...(staking ? [`delegator:${receipt.sender}:${staking.validator}`, `staking:${staking.validator}`, "staking", "dashboard-validators", "dashboard-summary"] : []),
      ...(gov ? ["governance", "new-proposal-params", ...(gov.proposalId ? [
        `proposal:${gov.proposalId}`, `proposal-raw:${gov.proposalId}`, `gov-params:${gov.proposalId}`,
        `tally:${gov.proposalId}`, `votes:${gov.proposalId}`, `deposits:${gov.proposalId}`, `my-vote:${gov.proposalId}:${receipt.sender}`,
      ] : [])] : [])],
  } }));
  const directJobs = jobs.filter(([, target]) => !claimed.has(target));
  const results = await Promise.allSettled([...directJobs.map(([, , read]) => read()), ...refreshes]);
  return results.flatMap((result, i) => result.status === "rejected" ? [serviceText("related_read_failed", { value0: directJobs[i]?.[0] ?? serviceText("screen_data_refresh"), value1: errorMessage(result.reason) })] : []);
}
