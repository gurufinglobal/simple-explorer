export type StakingActionType = "delegate" | "redelegate" | "undelegate" | "claim_rewards";

export async function submitStakingAction(
  actionType: StakingActionType,
  validatorAddress: string,
  amount: string,
): Promise<{ status: "submitted"; actionType: StakingActionType }> {
  if (actionType !== "claim_rewards" && (!validatorAddress || !amount)) {
    throw new Error("validatorAddress와 amount는 필수입니다.");
  }
  return { status: "submitted", actionType };
}
