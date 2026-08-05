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
  allRequiredFactsConfirmed: boolean;
  approval: ApprovalSnapshot;
  effect: EffectSnapshot;
  now?: Date;
};

export type CapabilityNotice =
  | "approved_execution_blocked"
  | "no_current_approval_execution_blocked"
  | "unapproved_execution_blocked"
  | null;

export type IntegrationAuthorityPresentation = {
  capabilityNotice: CapabilityNotice;
  presentationState: IntegrationAuthorityState;
  showActiveApproval: boolean;
  showApprovalCta: boolean;
  showCapabilityDependentRevisionControls: boolean;
  showExecutionCta: boolean;
  showRevokeApproval: boolean;
};

export function capabilityNoticeAnnouncement(
  notice: Exclude<CapabilityNotice, null>,
): string {
  const announcements: Record<Exclude<CapabilityNotice, null>, string> = {
    approved_execution_blocked:
      "Execution capability is revoked. The active approval remains recorded and can still be revoked, but it cannot run and no destination result is claimed.",
    no_current_approval_execution_blocked:
      "No current approval remains. Execution capability is revoked, so the proposal cannot receive execution authority or run.",
    unapproved_execution_blocked:
      "This proposal remains unapproved. Execution capability is revoked, so it cannot receive execution authority or run.",
  };
  return announcements[notice];
}

export function deriveIntegrationAuthorityPresentation({
  approvalStatus,
  authorityState,
  capabilityRevoked,
}: {
  approvalStatus: NonNullable<ApprovalSnapshot>["status"] | null;
  authorityState: IntegrationAuthorityState;
  capabilityRevoked: boolean;
}): IntegrationAuthorityPresentation {
  const hasActiveApproval =
    authorityState === "approved" && approvalStatus === "active";
  const approvalDecisionAvailable = [
    "failed",
    "ready_for_approval",
    "stale",
  ].includes(authorityState);

  return {
    capabilityNotice: capabilityRevoked
      ? hasActiveApproval
        ? "approved_execution_blocked"
        : approvalStatus === null
          ? "unapproved_execution_blocked"
          : "no_current_approval_execution_blocked"
      : null,
    presentationState: capabilityRevoked ? "revoked" : authorityState,
    showActiveApproval: hasActiveApproval,
    showApprovalCta:
      !capabilityRevoked && approvalDecisionAvailable,
    showCapabilityDependentRevisionControls: !capabilityRevoked,
    showExecutionCta:
      !capabilityRevoked &&
      hasActiveApproval,
    showRevokeApproval: hasActiveApproval,
  };
}

export function areRequiredAssertionsConfirmed(
  requiredAssertionIds: string[],
  assertions: Array<{ id: string; review_status: string }>,
): boolean {
  return (
    requiredAssertionIds.length > 0 &&
    requiredAssertionIds.every((assertionId) =>
      assertions.some(
        (assertion) =>
          assertion.id === assertionId &&
          assertion.review_status === "confirmed",
      ),
    )
  );
}

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
  allRequiredFactsConfirmed,
  approval,
  effect,
  now = new Date(),
}: IntegrationAuthorityInput): IntegrationAuthorityState {
  if (!action) {
    return "no_action";
  }

  if (!allRequiredFactsConfirmed) {
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
