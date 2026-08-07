import { describe, expect, it } from "vitest";

import { parseScreenshotCaptureDraft } from "./screenshot-capture";

function validDraft(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    platform: "wechat",
    captured_at: null,
    transcription_notes: [],
    messages: [
      {
        source_message_id: "m1",
        speaker: "candidate",
        text: "我周二下午有时间，不过这周三之前需要做决定。",
      },
    ],
    assertions: [
      {
        field: "availability",
        status: "proposed",
        value: "周二下午",
        evidence_message_id: "m1",
        evidence_quote: "我周二下午有时间",
        ambiguity: null,
      },
    ],
    action: {
      target: "确认周二下午的具体通话时间",
      reason: "候选人明确提供了可用时间",
      due: "本周二前",
      evidence_message_ids: ["m1"],
    },
    ...overrides,
  });
}

describe("screenshot capture proposal", () => {
  it("keeps exact, candidate-authored evidence and one supported action", () => {
    const draft = parseScreenshotCaptureDraft(validDraft());

    expect(draft.messages[0]?.sequence).toBe(0);
    expect(draft.assertions[0]?.field).toBe("availability");
    expect(draft.disposition).toBe("propose_action");
    expect(draft.action?.evidence_message_ids).toEqual(["m1"]);
  });

  it("rejects a quote that is not present in the transcribed message", () => {
    expect(() =>
      parseScreenshotCaptureDraft(
        validDraft({
          assertions: [
            {
              field: "availability",
              status: "proposed",
              value: "周五",
              evidence_message_id: "m1",
              evidence_quote: "我周五有时间",
              ambiguity: null,
            },
          ],
        }),
      ),
    ).toThrow(/exact source quote/i);
  });

  it("turns visible ambiguity into clarification and removes action authority", () => {
    const draft = parseScreenshotCaptureDraft(
      validDraft({
        assertions: [
          {
            field: "decision_deadline",
            status: "ambiguous",
            value: "这周三",
            evidence_message_id: "m1",
            evidence_quote: "这周三之前需要做决定",
            ambiguity: "截图里没有年份和时区。",
          },
        ],
      }),
    );

    expect(draft.disposition).toBe("clarify");
    expect(draft.action).toBeNull();
  });

  it("preserves a truthful no-action result when no supported signal exists", () => {
    const draft = parseScreenshotCaptureDraft(
      validDraft({
        assertions: [],
        action: null,
      }),
    );

    expect(draft.disposition).toBe("no_action");
    expect(draft.assertions).toEqual([]);
    expect(draft.action).toBeNull();
  });

  it("rejects unsupported person-scoring fields", () => {
    expect(() =>
      parseScreenshotCaptureDraft(
        validDraft({
          assertions: [
            {
              field: "candidate_quality",
              status: "proposed",
              value: "high",
              evidence_message_id: "m1",
              evidence_quote: "我周二下午有时间",
              ambiguity: null,
            },
          ],
        }),
      ),
    ).toThrow();
  });
});
