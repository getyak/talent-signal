import { describe, expect, it } from "vitest";

import {
  parseConversationTranscript,
  reviewedConversationFragments,
  validateReviewedConversationMessages,
} from "./conversation-transcript";

describe("conversation transcript review", () => {
  it("recognizes only explicit bilingual speaker labels", () => {
    const analysis = parseConversationTranscript(
      [
        "Candidate: Availability: 2026-09-15",
        "招聘者：Would a Tuesday follow-up work?",
        "候選人: Notice period: 30 days",
      ].join("\n"),
    );

    expect(analysis).toMatchObject({
      explicitly_labeled_count: 3,
      unknown_count: 0,
      messages: [
        { sequence: 0, speaker: "candidate", text: "Availability: 2026-09-15" },
        { sequence: 1, speaker: "recruiter", text: "Would a Tuesday follow-up work?" },
        { sequence: 2, speaker: "candidate", text: "Notice period: 30 days" },
      ],
    });
  });

  it("never infers an unlabeled speaker from wording or position", () => {
    const analysis = parseConversationTranscript(
      "I can start next month.\nCan you share your notice period?",
    );

    expect(analysis.messages.map((message) => message.speaker)).toEqual([
      "unknown",
      "unknown",
    ]);
    expect(analysis.unknown_count).toBe(2);
  });

  it("supports an explicit candidate-only source decision", () => {
    const analysis = parseConversationTranscript(
      "Location: Singapore\nWork mode: Hybrid",
      "candidate",
    );

    expect(analysis.messages).toEqual([
      { sequence: 0, speaker: "candidate", text: "Location: Singapore" },
      { sequence: 1, speaker: "candidate", text: "Work mode: Hybrid" },
    ]);
  });

  it("normalizes reviewed messages and rejects unsupported attribution", () => {
    expect(
      validateReviewedConversationMessages([
        { speaker: "candidate", text: "  Notice period:   30 days  " },
      ]),
    ).toEqual([
      { sequence: 0, speaker: "candidate", text: "Notice period: 30 days" },
    ]);
    expect(() =>
      validateReviewedConversationMessages([
        { speaker: "model_guessed", text: "Location: London" },
      ]),
    ).toThrow(/已审阅文字和说话人/);
  });

  it("keeps every message proposed and preserves unknown attribution", () => {
    expect(
      reviewedConversationFragments(
        [
          { speaker: "candidate", text: "Location: Singapore" },
          { speaker: "unknown", text: "Work mode: Remote" },
        ],
        "web-resource:123",
      ),
    ).toEqual([
      expect.objectContaining({
        client_resource_id: "web-resource:123",
        kind: "message",
        sequence: 0,
        review_status: "proposed",
        attribution: { actor_kind: "candidate", status: "confirmed" },
      }),
      expect.objectContaining({
        sequence: 1,
        review_status: "proposed",
        attribution: { actor_kind: "unknown", status: "unknown" },
      }),
    ]);
  });
});
