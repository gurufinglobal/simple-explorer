"use client";
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
  vote: { typeUrl: "/cosmos.gov.v1.MsgVote", label: "투표" },
  deposit: { typeUrl: "/cosmos.gov.v1.MsgDeposit", label: "예치" },
  proposal: { typeUrl: "/cosmos.gov.v1.MsgSubmitProposal", label: "텍스트 제안" },
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
  if (chain.features?.governance !== true) return "거버넌스 모듈 지원 미확인으로 전송을 차단합니다.";
  const capability = chain.governanceCapabilities?.[action];
  if (!capability || capability.typeUrl !== governanceMessages[action]?.typeUrl) return "이 거버넌스 메시지·수수료 지원 근거가 없습니다. 수수료 미확인으로 전송을 차단합니다.";
  if (wallet === "walletconnect") return "설치된 CosmJS는 gov v1 Amino 변환을 지원하지 않습니다. WalletConnect 전송을 차단합니다.";
  if (!capability.signing.some(s => s.wallet === wallet && s.method === "direct" && chain.signing?.some(c => c.wallet === wallet && c.method === "direct"))) return "이 거버넌스 메시지의 Direct 서명 방식은 검증되지 않았습니다. gov v1 Amino 변환은 지원하지 않습니다.";
  if (action === "proposal" && !chain.governanceCapabilities?.proposal?.legacyContent?.evidence) return "체인의 legacy TextProposal handler·authority 지원 근거가 없습니다.";
  return null;
}
const coins = z.array(z.object({ denom: z.string().min(1), amount: z.string().regex(/^[1-9]\d*$/) })).min(1);
const stable = (value: unknown): string => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

/** Preparation is the only write entry point. execute is returned only after all read/fee checks. */
export async function prepareGovernanceTx(input: GovernanceTxInput, assertInputCurrent: () => void = () => {}) {
  const params = { ...input };
  if (!(params.action in governanceMessages)) throw new Error("미지원 거버넌스 행위입니다.");
  if (params.action !== "proposal" && !canonicalProposalId(params.proposalId)) throw new Error("제안 ID는 0보다 큰 canonical uint64 정수여야 합니다.");
  if (params.action === "vote" && !Object.hasOwn(options, params.option)) throw new Error("유효한 투표 선택지를 확인하세요.");
  if (params.action !== "vote") {
    assertBaseAmount(params.amount);
    if (!params.denom) throw new Error("예치 denom 미확인");
  }
  if (params.action === "proposal" && (!params.title.trim() || !params.summary.trim() || !params.description.trim())) throw new Error("제목·요약·본문을 입력하세요.");
  return prepareTransaction(params, async ({ chain, query, sender, assertCurrent }) => {
    const reason = governanceBlockReason(chain, params.action, params.walletType);
    if (reason) throw new Error(reason);
    const capability = chain.governanceCapabilities![params.action]!;
    let baseline: string | undefined;
    let authority: string | null = null;
    let periodEnd = Infinity;
    let depositPolicy = "";
    const assertPeriod = () => { if (Date.now() >= periodEnd) throw new Error("제안 기간이 종료되었습니다. 상태를 다시 확인하세요."); };
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
      if (!/^\d+$/.test(account.accountNumber ?? "") || !/^\d+$/.test(account.sequence ?? "")) throw new Error("서명 계정 권한·sequence 미확인");
      const deposit = z.object({ params: z.object({ min_deposit: coins }).passthrough().optional(), deposit_params: z.object({ min_deposit: coins }).passthrough().optional() }).parse(depositResponse);
      const minimum = (deposit.params ?? deposit.deposit_params)?.min_deposit;
      if (!minimum) throw new Error("현재 최소 예치 params 미확인");
      const voting = z.object({ params: z.object({ voting_period: z.string().min(1) }).passthrough().optional(), voting_params: z.object({ voting_period: z.string().min(1) }).passthrough().optional() }).parse(votingResponse);
      const tallyFields = z.object({ quorum: z.string().min(1), threshold: z.string().min(1), veto_threshold: z.string().min(1) }).passthrough();
      const tally = z.object({ params: tallyFields.optional(), tally_params: tallyFields.optional() }).parse(tallyResponse);
      if (!(voting.params ?? voting.voting_params) || !(tally.params ?? tally.tally_params)) throw new Error("현재 governance params 미확인");
      let proposalState: unknown = null;
      if (params.action !== "proposal") {
        const timestamp = z.string().nullable().optional();
        const proposal = z.object({ proposal: z.object({ id: z.string(), status: z.string(), deposit_end_time: timestamp, voting_start_time: timestamp, voting_end_time: timestamp }) }).parse(proposalResponse).proposal;
        if (proposal.id !== params.proposalId) throw new Error("조회 제안 ID와 거래 대상이 다릅니다.");
        const expected = params.action === "vote" ? "PROPOSAL_STATUS_VOTING_PERIOD" : "PROPOSAL_STATUS_DEPOSIT_PERIOD";
        if (proposal.status !== expected) throw new Error("제안 상태가 변경되었거나 현재 행위를 허용하지 않습니다.");
        periodEnd = Date.parse((params.action === "vote" ? proposal.voting_end_time : proposal.deposit_end_time) ?? "");
        const start = params.action === "vote" ? Date.parse(proposal.voting_start_time ?? "") : -Infinity;
        if (!Number.isFinite(periodEnd) || (params.action === "vote" && (!Number.isFinite(start) || Date.now() < start))) throw new Error("제안 기간을 확인할 수 없거나 아직 시작되지 않았습니다.");
        assertPeriod();
        proposalState = proposal;
      }
      if (params.action !== "vote") {
        if (minimum.length !== 1 || minimum[0].denom !== params.denom) throw new Error("현재 최소 예치 denom과 다르거나 다중 denom 정책은 지원하지 않습니다.");
        depositPolicy = `앱 예치 정책: 현재 최소 예치 전액 ${minimum[0].amount} ${minimum[0].denom} 이상 · 단일 denom · 부분 예치 미지원`;
        // Conservative app policy: full current minimum, not an inferred initial/minimum ratio.
        if (BigInt(params.amount) < BigInt(minimum[0].amount)) throw new Error(`앱 예치 정책: 현재 최소 예치 전액 ${minimum[0].amount} ${minimum[0].denom} 이상을 입력하세요. 부분 예치는 지원하지 않습니다.`);
      }
      if (params.action === "proposal") {
        const expected = chain.governanceCapabilities!.proposal!.legacyContent!.authority;
        if (!moduleAddress || moduleAddress !== expected) throw new Error("현재 gov authority가 검증된 legacy content 설정과 다릅니다.");
        const decoded = bech32.decode(moduleAddress);
        if (decoded.prefix !== chain.bech32Prefix || bech32.fromWords(decoded.words).length !== 20) throw new Error("gov authority 주소 형식 불일치");
        authority = moduleAddress;
      }
      const fingerprint = stable({ depositResponse, votingResponse, tallyResponse, proposalState, moduleAddress, accountNumber: account.accountNumber });
      if (baseline !== undefined && baseline !== fingerprint) throw new Error("제안 상태·기간·params·계정 권한이 변경되었습니다. 다시 확인하세요.");
      baseline = fingerprint;
    };
    await readState();
    let displayAmount: string | undefined;
    let unit: string | undefined;
    if (params.action !== "vote") {
      const metadata = (await getDenomsMetadata(query)).find(m => m.baseDenom === params.denom);
      assertCurrent();
      if (metadata?.decimals == null) throw new Error("표시 정밀도 미확인: 예치 수량을 확인할 수 없습니다.");
      const padded = params.amount.padStart(metadata.decimals + 1, "0");
      displayAmount = params.displayAmount ?? (metadata.decimals ? `${padded.slice(0, -metadata.decimals)}.${padded.slice(-metadata.decimals)}` : params.amount);
      if (displayToBase(displayAmount, metadata.decimals) !== params.amount) throw new Error("표시 수량과 예치 원본이 다릅니다.");
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
        targetLabel: params.action === "proposal" ? "Gov authority" : "전체 제안 ID",
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
          if (available < requiredAmount) throw new Error(`${denom} 사용 가능 잔액이 부족합니다. 예치와 수수료의 합산 잔액을 확인하세요.`);
        }
      },
    };
  }, assertInputCurrent);
}
