import { describe, expect, it } from "vitest";

import {
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
    allFactsReviewed: true,
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
        input({ allFactsReviewed: false }),
      ),
    ).toBe("review_required");
    expect(deriveIntegrationAuthorityState(input())).toBe(
      "ready_for_approval",
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
