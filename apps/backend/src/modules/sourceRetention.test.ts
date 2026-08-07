import { describe, expect, it } from "vitest";
import type { CreateCaptureRequest } from "@talent-signal/contracts";

import { ApiError } from "../lib/apiError.js";
import {
  EVIDENCE_CROP_MAX_RETENTION_DAYS,
  FULL_SOURCE_MAX_RETENTION_DAYS,
  resolveSourceRetentionPolicy,
  validateSourceRetentionPayload,
} from "./sourceRetention.js";

const submittedAt = new Date("2026-08-05T10:00:00.000Z");

function payloadRequest(
  sourceScope: CreateCaptureRequest["source"]["retention"]["source_scope"],
  kind: CreateCaptureRequest["source"]["kind"],
  messageCount = 1,
): CreateCaptureRequest {
  return {
    idempotency_key: "retention-payload-shape",
    source: {
      kind,
      captured_at: submittedAt.toISOString(),
      source_timezone: "UTC",
      purpose: "Synthetic payload-shape test",
      retention: {
        requested_mode:
          sourceScope === "full_reviewed_source"
            ? "full_source"
            : "evidence_crop",
        source_scope: sourceScope,
      },
    },
    identity: {
      status: "unbound",
      reason: "Payload-shape test has no candidate identity.",
    },
    messages: Array.from({ length: messageCount }, (_, sequence) => ({
      source_message_id: `message-${sequence}`,
      sequence,
      speaker: "unknown" as const,
      text: `Synthetic reviewed payload ${sequence}`,
    })),
  };
}

function expectPayloadMismatch(request: CreateCaptureRequest): void {
  try {
    validateSourceRetentionPayload(request);
    throw new Error("Expected the retention payload to be rejected.");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(422);
    expect((error as ApiError).code).toBe(
      "SOURCE_SCOPE_PAYLOAD_MISMATCH",
    );
  }
}

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

  it("binds selected-text retention to one atomic transcript message", () => {
    expect(() =>
      validateSourceRetentionPayload(
        payloadRequest("reviewed_selected_text", "transcript"),
      ),
    ).not.toThrow();
    expectPayloadMismatch(
      payloadRequest("reviewed_selected_text", "transcript", 2),
    );
    expectPayloadMismatch(
      payloadRequest("reviewed_selected_text", "screenshot_metadata"),
    );
  });

  it("binds reviewed extracted text to screenshot metadata", () => {
    expect(() =>
      validateSourceRetentionPayload(
        payloadRequest(
          "reviewed_extracted_text",
          "screenshot_metadata",
          3,
        ),
      ),
    ).not.toThrow();
    expectPayloadMismatch(
      payloadRequest("reviewed_extracted_text", "transcript"),
    );
  });

  it("rejects evidence-crop scope until an actual crop asset is governed", () => {
    expectPayloadMismatch(
      payloadRequest("reviewed_evidence_crop", "screenshot_metadata"),
    );
    expectPayloadMismatch(
      payloadRequest(
        "reviewed_evidence_crop",
        "screenshot_metadata",
        2,
      ),
    );
  });
});
