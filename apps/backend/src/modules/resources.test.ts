import { describe, expect, it } from "vitest";

import type {
  EvidenceFragmentReviewRequest,
  EvidenceFragmentReviewResponse,
} from "@talent-signal/contracts";

import { ApiError } from "../lib/apiError.js";
import { assertEvidenceReviewReplayAuthority } from "./resources.js";

const fragmentId = "00000000-0000-4000-8000-000000000101";
const priorReviewId = "00000000-0000-4000-8000-000000000102";
const appliedReviewId = "00000000-0000-4000-8000-000000000103";
const laterReviewId = "00000000-0000-4000-8000-000000000104";

const request: EvidenceFragmentReviewRequest = {
  idempotency_key: "ios:evidence-review:authority-bound",
  expected_review_status: "reviewed",
  expected_last_review_id: priorReviewId,
  decision: "rejected",
  reason: "The excerpt needs correction.",
};

const replay: EvidenceFragmentReviewResponse = {
  fragment_id: fragmentId,
  resource_id: "00000000-0000-4000-8000-000000000105",
  review_id: appliedReviewId,
  prior_review_id: priorReviewId,
  review_status: "rejected",
  resource_processing_state: "failed",
  decided_at: "2026-08-25T04:30:00.000Z",
};

describe("evidence review replay authority", () => {
  it("allows a same-operation retry only while its review is still canonical", () => {
    expect(() =>
      assertEvidenceReviewReplayAuthority(
        fragmentId,
        request,
        { review_status: "rejected", last_review_id: appliedReviewId },
        replay,
      ),
    ).not.toThrow();
  });

  it("rejects an old replay after a later authority cycle", () => {
    try {
      assertEvidenceReviewReplayAuthority(
        fragmentId,
        request,
        { review_status: "reviewed", last_review_id: laterReviewId },
        replay,
      );
      expect.unreachable("A stale replay must not be accepted.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("EVIDENCE_REVIEW_AUTHORITY_STALE");
      expect((error as ApiError).statusCode).toBe(409);
    }
  });

  it("rejects a replay that is not bound to the requested predecessor", () => {
    try {
      assertEvidenceReviewReplayAuthority(
        fragmentId,
        { ...request, expected_last_review_id: laterReviewId },
        { review_status: "rejected", last_review_id: appliedReviewId },
        replay,
      );
      expect.unreachable("A replay with a different predecessor must fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("EVIDENCE_REVIEW_AUTHORITY_STALE");
    }
  });
});
