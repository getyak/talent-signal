import { describe, expect, it } from "vitest";

import { ApiError } from "../lib/apiError.js";
import {
  EVIDENCE_CROP_MAX_RETENTION_DAYS,
  FULL_SOURCE_MAX_RETENTION_DAYS,
  resolveSourceRetentionPolicy,
} from "./sourceRetention.js";

const submittedAt = new Date("2026-08-05T10:00:00.000Z");

describe("source-retention policy", () => {
  it("binds ephemeral source to review completion without a deadline", () => {
    const policy = resolveSourceRetentionPolicy(
      {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
      submittedAt,
    );
    expect(policy).toMatchObject({
      effectiveMode: "ephemeral",
      retentionUntil: null,
      sourceAccessReason: "awaiting_review_completion",
    });
  });

  it("caps evidence-crop retention and honors a shorter requested deadline", () => {
    const maximum = resolveSourceRetentionPolicy(
      {
        requested_mode: "evidence_crop",
        source_scope: "reviewed_selected_text",
      },
      submittedAt,
    );
    expect(maximum.retentionUntil?.toISOString()).toBe(
      new Date(
        submittedAt.getTime() +
          EVIDENCE_CROP_MAX_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
      ).toISOString(),
    );

    const requested = "2026-08-05T10:00:02.000Z";
    const shorter = resolveSourceRetentionPolicy(
      {
        requested_mode: "evidence_crop",
        source_scope: "reviewed_selected_text",
        requested_retention_until: requested,
      },
      submittedAt,
    );
    expect(shorter.retentionUntil?.toISOString()).toBe(requested);
  });

  it("accepts full source only with a complete reviewed-source scope", () => {
    expect(() =>
      resolveSourceRetentionPolicy(
        {
          requested_mode: "full_source",
          source_scope: "reviewed_selected_text",
        },
        submittedAt,
      ),
    ).toThrowError(ApiError);

    const fullSource = resolveSourceRetentionPolicy(
      {
        requested_mode: "full_source",
        source_scope: "full_reviewed_source",
      },
      submittedAt,
      "fixture",
    );
    expect(fullSource.retentionUntil?.toISOString()).toBe(
      new Date(
        submittedAt.getTime() +
          FULL_SOURCE_MAX_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
      ).toISOString(),
    );
  });

  it("rejects full source when the transport cannot prove completeness", () => {
    expect(() =>
      resolveSourceRetentionPolicy(
        {
          requested_mode: "full_source",
          source_scope: "full_reviewed_source",
        },
        submittedAt,
        "transcript",
      ),
    ).toThrowError(ApiError);
  });

  it("rejects caller deadlines for ephemeral source", () => {
    expect(() =>
      resolveSourceRetentionPolicy(
        {
          requested_mode: "ephemeral",
          source_scope: "reviewed_selected_text",
          requested_retention_until: "2026-08-05T10:00:02.000Z",
        },
        submittedAt,
      ),
    ).toThrowError(ApiError);
  });
});
