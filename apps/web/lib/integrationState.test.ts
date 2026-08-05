import { describe, expect, it } from "vitest";

import {
  areRequiredAssertionsConfirmed,
  capabilityNoticeAnnouncement,
  deriveIntegrationAuthorityPresentation,
  deriveIntegrationAuthorityState,
  integrationStateAnnouncement,
  presentedAssertionValue,
  type IntegrationAuthorityInput,
} from "./integrationState";

const now = new Date("2026-08-05T12:00:00.000Z");

function input(
  overrides: Partial<IntegrationAuthorityInput> = {},
): IntegrationAuthorityInput {
  return {
    action: {
      exact_preview_digest: "digest-v1",
      status: "proposed",
      version: 1,
    },
    allRequiredFactsConfirmed: true,
    approval: null,
    effect: null,
    now,
    ...overrides,
  };
}

describe("authenticated integration authority state", () => {
  it("keeps fact review separate from action approval", () => {
    expect(
      deriveIntegrationAuthorityState(
        input({ allRequiredFactsConfirmed: false }),
      ),
    ).toBe("review_required");
    expect(deriveIntegrationAuthorityState(input())).toBe(
      "ready_for_approval",
    );
  });

  it("blocks authority when an action-bound fact was dismissed", () => {
    expect(
      areRequiredAssertionsConfirmed(
        ["assertion-1", "assertion-2"],
        [
          { id: "assertion-1", review_status: "confirmed" },
          { id: "assertion-2", review_status: "dismissed" },
        ],
      ),
    ).toBe(false);
    expect(
      areRequiredAssertionsConfirmed(
        ["assertion-1"],
        [
          { id: "assertion-1", review_status: "confirmed" },
          { id: "assertion-2", review_status: "dismissed" },
        ],
      ),
    ).toBe(true);
  });

  it("suppresses approval and execution paths after capability revocation without an approval", () => {
    const presentation = deriveIntegrationAuthorityPresentation({
      approvalStatus: null,
      authorityState: "ready_for_approval",
      capabilityRevoked: true,
    });

    expect(presentation).toEqual({
      capabilityNotice: "unapproved_execution_blocked",
      presentationState: "revoked",
      showActiveApproval: false,
      showApprovalCta: false,
      showCapabilityDependentRevisionControls: false,
      showExecutionCta: false,
      showRevokeApproval: false,
    });
    expect(capabilityNoticeAnnouncement(presentation.capabilityNotice!)).toBe(
      "This proposal remains unapproved. Execution capability is revoked, so it cannot receive execution authority or run.",
    );
  });

  it("preserves an active approval while capability revocation blocks execution", () => {
    const presentation = deriveIntegrationAuthorityPresentation({
      approvalStatus: "active",
      authorityState: "approved",
      capabilityRevoked: true,
    });

    expect(presentation).toEqual({
      capabilityNotice: "approved_execution_blocked",
      presentationState: "revoked",
      showActiveApproval: true,
      showApprovalCta: false,
      showCapabilityDependentRevisionControls: false,
      showExecutionCta: false,
      showRevokeApproval: true,
    });
    expect(capabilityNoticeAnnouncement(presentation.capabilityNotice!)).toBe(
      "Execution capability is revoked. The active approval remains recorded and can still be revoked, but it cannot run and no destination result is claimed.",
    );
  });

  it("offers execution only while both approval and capability are active", () => {
    expect(
      deriveIntegrationAuthorityPresentation({
        approvalStatus: "active",
        authorityState: "approved",
        capabilityRevoked: false,
      }),
    ).toEqual({
      capabilityNotice: null,
      presentationState: "approved",
      showActiveApproval: true,
      showApprovalCta: false,
      showCapabilityDependentRevisionControls: true,
      showExecutionCta: true,
      showRevokeApproval: true,
    });
  });

  it("does not describe a revoked approval as still unapproved", () => {
    const presentation = deriveIntegrationAuthorityPresentation({
      approvalStatus: "revoked",
      authorityState: "revoked",
      capabilityRevoked: true,
    });

    expect(presentation.capabilityNotice).toBe(
      "no_current_approval_execution_blocked",
    );
    expect(capabilityNoticeAnnouncement(presentation.capabilityNotice!)).toBe(
      "No current approval remains. Execution capability is revoked, so the proposal cannot receive execution authority or run.",
    );
  });

  it("rejects expired and version-mismatched approval as stale", () => {
    expect(
      deriveIntegrationAuthorityState(
        input({
          approval: {
            action_version: 1,
            exact_preview_digest: "digest-v1",
            expires_at: "2026-08-05T11:59:59.000Z",
            status: "active",
          },
        }),
      ),
    ).toBe("stale");

    expect(
      deriveIntegrationAuthorityState(
        input({
          action: {
            exact_preview_digest: "digest-v2",
            status: "proposed",
            version: 2,
          },
          approval: {
            action_version: 1,
            exact_preview_digest: "digest-v1",
            expires_at: "2026-08-05T12:15:00.000Z",
            status: "active",
          },
        }),
      ),
    ).toBe("stale");
  });

  it("never converts revoked or unknown authority into success", () => {
    expect(
      deriveIntegrationAuthorityState(
        input({
          approval: {
            action_version: 1,
            exact_preview_digest: "digest-v1",
            expires_at: "2026-08-05T12:15:00.000Z",
            status: "revoked",
          },
        }),
      ),
    ).toBe("revoked");

    expect(
      deriveIntegrationAuthorityState(
        input({
          effect: {
            attempt_status: "unknown",
            observation: null,
            outcome: { status: "unknown" },
          },
        }),
      ),
    ).toBe("reconciliation_required");
  });

  it("requires a verified attempt with matched readback for success", () => {
    expect(
      deriveIntegrationAuthorityState(
        input({
          effect: {
            attempt_status: "verified",
            observation: { match_status: "mismatched" },
            outcome: { status: "verified" },
          },
        }),
      ),
    ).not.toBe("verified");

    const verified = deriveIntegrationAuthorityState(
      input({
        effect: {
          attempt_status: "verified",
          observation: { match_status: "matched" },
          outcome: { status: "unknown" },
        },
      }),
    );
    expect(verified).toBe("verified");
    expect(integrationStateAnnouncement(verified)).toContain(
      "matching destination readback",
    );
  });

  it("treats a missing action as intentional no_action", () => {
    expect(
      deriveIntegrationAuthorityState(input({ action: null })),
    ).toBe("no_action");
  });

  it("presents the recruiter-confirmed correction instead of the proposal", () => {
    expect(
      presentedAssertionValue("assertion-1", "remote matters a lot", [
        {
          source_assertion_id: "assertion-1",
          value: "remote work is important",
        },
      ]),
    ).toBe("remote work is important");
    expect(
      presentedAssertionValue("assertion-2", "Tuesday afternoon", []),
    ).toBe("Tuesday afternoon");
  });
});
