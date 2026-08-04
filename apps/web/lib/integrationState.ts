export type IntegrationAuthorityState =
  | "approved"
  | "failed"
  | "no_action"
  | "ready_for_approval"
  | "reconciliation_required"
  | "review_required"
  | "revoked"
  | "stale"
  | "verified";

type ActionSnapshot = {
  exact_preview_digest: string;
  status: string;
  version: number;
} | null;

type ApprovalSnapshot = {
  action_version: number;
  exact_preview_digest: string;
  expires_at: string;
  status: "active" | "consumed" | "revoked" | "stale";
} | null;

type EffectSnapshot = {
  attempt_status: "failed" | "unknown" | "verified";
  observation: {
    match_status: "matched" | "mismatched" | "unavailable";
  } | null;
  outcome: {
    status: "failed" | "unknown" | "verified";
  } | null;
} | null;

export type IntegrationAuthorityInput = {
  action: ActionSnapshot;
  allFactsReviewed: boolean;
  approval: ApprovalSnapshot;
  effect: EffectSnapshot;
  now?: Date;
};

export function presentedAssertionValue(
  assertionId: string,
  proposalValue: string | null,
  confirmedState: Array<{
    source_assertion_id: string;
    value: string;
  }>,
): string | null {
  return (
    confirmedState.find(
      (assertion) => assertion.source_assertion_id === assertionId,
    )?.value ?? proposalValue
  );
}

export function deriveIntegrationAuthorityState({
  action,
  allFactsReviewed,
  approval,
  effect,
  now = new Date(),
}: IntegrationAuthorityInput): IntegrationAuthorityState {
  if (!action) {
    return "no_action";
  }

  if (!allFactsReviewed) {
    return "review_required";
  }

  if (
    effect?.attempt_status === "verified" &&
    effect.observation?.match_status === "matched"
  ) {
    return "verified";
  }

  if (
    effect?.attempt_status === "unknown" ||
    effect?.outcome?.status === "unknown"
  ) {
    return "reconciliation_required";
  }

  if (effect?.attempt_status === "failed") {
    return "failed";
  }

  if (approval?.status === "revoked" || action.status === "revoked") {
    return "revoked";
  }

  const approvalExpired = approval
    ? new Date(approval.expires_at).getTime() <= now.getTime()
    : false;
  const approvalDoesNotMatch =
    approval !== null &&
    (approval.action_version !== action.version ||
      approval.exact_preview_digest !== action.exact_preview_digest);

  if (
    approval?.status === "stale" ||
    approvalExpired ||
    approvalDoesNotMatch
  ) {
    return "stale";
  }

  if (approval?.status === "active") {
    return "approved";
  }

  return "ready_for_approval";
}

export function integrationStateAnnouncement(
  state: IntegrationAuthorityState,
): string {
  const announcements: Record<IntegrationAuthorityState, string> = {
    approved:
      "Exact local effect approved. No destination result has been claimed.",
    failed:
      "The local effect failed. No verified result is claimed and the review remains available.",
    no_action:
      "No action is supported. The source remains context without manufactured urgency.",
    ready_for_approval:
      "Fact review is complete. The exact local effect now requires a separate decision.",
    reconciliation_required:
      "The effect result is unknown. Do not repeat execution; reconcile destination readback first.",
    review_required:
      "Review each source-linked fact before the action can receive authority.",
    revoked:
      "The prior approval was revoked. No execution authority remains.",
    stale:
      "The approval no longer matches the current action. Review the changed preview before approving again.",
    verified:
      "The local effect is verified only after matching destination readback.",
  };
  return announcements[state];
}
