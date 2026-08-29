import { describe, expect, it } from "vitest";

import {
  parseScreenshotCaptureDraft,
  validateScreenshotAnalysisMeta,
  validateReviewedScreenshotEdit,
} from "./screenshot-capture";

function validDraft(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    platform: "wechat",
    captured_at: "2026-08-07T09:41:00+08:00",
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
  it.each([
    "wechat",
    "whatsapp",
    "line",
    "boss_zhipin",
    "xiaohongshu",
    "unknown",
  ])("preserves the supported %s channel", (platform) => {
    expect(
      parseScreenshotCaptureDraft(validDraft({ platform })).platform,
    ).toBe(platform);
  });

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
    ).toThrow(/准确的来源引文/);
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

  it("does not accept a proposed status when the model also reports ambiguity", () => {
    const draft = parseScreenshotCaptureDraft(
      validDraft({
        assertions: [
          {
            field: "work_mode_constraint",
            status: "proposed",
            value: "remote",
            evidence_message_id: "m1",
            evidence_quote: "我周二下午有时间",
            ambiguity: "The source does not establish whether remote work is required or preferred.",
          },
        ],
      }),
    );

    expect(draft.assertions[0]?.status).toBe("ambiguous");
    expect(draft.disposition).toBe("clarify");
    expect(draft.action).toBeNull();
  });

  it("discards a candidate assertion backed by a recruiter message", () => {
    const draft = parseScreenshotCaptureDraft(
      validDraft({
        messages: [
          {
            source_message_id: "m1",
            speaker: "recruiter",
            text: "I have another offer and need to decide Wednesday.",
          },
        ],
        assertions: [
          {
            field: "decision_deadline",
            status: "ambiguous",
            value: "Wednesday",
            evidence_message_id: "m1",
            evidence_quote: "decide Wednesday",
            ambiguity: "The sender is visibly the recruiter.",
          },
        ],
        action: null,
      }),
    );

    expect(draft.assertions).toEqual([]);
    expect(draft.disposition).toBe("no_action");
    expect(draft.transcription_notes).toContainEqual(
      expect.stringMatching(/discarded.*recruiter/i),
    );
  });

  it("derives speaker identity from visual direction instead of message semantics", () => {
    const draft = parseScreenshotCaptureDraft(
      validDraft({
        messages: [
          {
            source_message_id: "m1",
            visual_direction: "incoming",
            speaker: "candidate",
            text: "I have another offer.",
          },
          {
            source_message_id: "m2",
            visual_direction: "outgoing",
            speaker: "recruiter",
            text: "Thank you for letting me know.",
          },
        ],
        assertions: [],
        action: null,
      }),
      {
        require_visual_direction: true,
        screenshot_owner: "candidate",
      },
    );

    expect(draft.messages.map((message) => message.speaker)).toEqual([
      "recruiter",
      "candidate",
    ]);
  });

  it("fails closed when a provider omits visual direction", () => {
    expect(() =>
      parseScreenshotCaptureDraft(validDraft(), {
        require_visual_direction: true,
        screenshot_owner: "candidate",
      }),
    ).toThrow(/visual message direction/i);
  });

  it("bounds verbose model explanations without changing exact evidence", () => {
    const longExplanation = `Speaker ownership remains uncertain ${"because the visible account chrome does not establish identity ".repeat(5)}`;
    const draft = parseScreenshotCaptureDraft(
      validDraft({
        transcription_notes: [longExplanation],
        assertions: [
          {
            field: "availability",
            status: "ambiguous",
            value: "周二下午",
            evidence_message_id: "m1",
            evidence_quote: "我周二下午有时间",
            ambiguity: longExplanation,
          },
        ],
      }),
    );

    expect(draft.transcription_notes[0]).toHaveLength(180);
    expect(draft.transcription_notes[0]).toMatch(/…$/);
    expect(draft.assertions[0]?.ambiguity).toHaveLength(180);
    expect(draft.assertions[0]?.evidence_quote).toBe("我周二下午有时间");
    expect(draft.messages[0]?.text).toBe(
      "我周二下午有时间，不过这周三之前需要做决定。",
    );
  });

  it("still rejects overlong source evidence instead of truncating it", () => {
    const overlongMessage = "候".repeat(4_001);
    expect(() =>
      parseScreenshotCaptureDraft(
        validDraft({
          messages: [
            {
              source_message_id: "m1",
              speaker: "candidate",
              text: overlongMessage,
            },
          ],
          assertions: [],
          action: null,
        }),
      ),
    ).toThrow();
  });

  it("downgrades a relative deadline when screenshot time is not verified", () => {
    const draft = parseScreenshotCaptureDraft(
      validDraft({ captured_at: null }),
    );

    expect(draft.assertions[0]?.status).toBe("ambiguous");
    expect(draft.assertions[0]?.ambiguity).toMatch(/capture time/i);
    expect(draft.disposition).toBe("clarify");
    expect(draft.action).toBeNull();
  });

  it("does not turn a request to clarify timing into a known deadline", () => {
    const draft = parseScreenshotCaptureDraft(
      validDraft({
        captured_at: "Friday, August 7",
        assertions: [
          {
            field: "decision_deadline",
            status: "proposed",
            value: "Needs timing clarification",
            evidence_message_id: "m1",
            evidence_quote: "需要做决定",
            ambiguity: null,
          },
        ],
      }),
    );

    expect(draft.captured_at).toBeNull();
    expect(draft.assertions[0]?.status).toBe("ambiguous");
    expect(draft.assertions[0]?.ambiguity).toMatch(/does not state/i);
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

  it("accepts a human transcription correction only after proposals are removed", () => {
    const original = parseScreenshotCaptureDraft(validDraft());
    const reviewed = {
      ...original,
      messages: original.messages.map((message) => ({
        ...message,
        text: "我周二下午有时间，不过这周三之前需要做决定",
      })),
      assertions: [],
      action: null,
      disposition: "no_action",
    };

    expect(
      validateReviewedScreenshotEdit(original, reviewed).messages[0]?.text,
    ).toContain("周三");
  });

  it("rejects a transcription correction that keeps model-derived facts", () => {
    const original = parseScreenshotCaptureDraft(validDraft());
    const reviewed = {
      ...original,
      messages: original.messages.map((message) => ({
        ...message,
        text: `${message.text}（已核对）`,
      })),
    };

    expect(() => validateReviewedScreenshotEdit(original, reviewed)).toThrow(
      /remove model-derived facts/i,
    );
  });

  it("rejects adding or reordering messages during transcription review", () => {
    const original = parseScreenshotCaptureDraft(validDraft());
    const reviewed = {
      ...original,
      messages: [
        ...original.messages,
        {
          source_message_id: "invented",
          sequence: 1,
          speaker: "candidate",
          text: "Not present in the source inventory",
        },
      ],
      assertions: [],
      action: null,
      disposition: "no_action",
    };

    expect(() => validateReviewedScreenshotEdit(original, reviewed)).toThrow(
      /message inventory/i,
    );
  });

  it("retains a bounded, browser-local minimization receipt for BigModel", () => {
    const meta = validateScreenshotAnalysisMeta({
      provider: "Zhipu BigModel",
      model: "glm-5.3-flash",
      prompt_version: "screenshot-evidence.v1",
      pre_provider_minimization: {
        crop_bottom_percent: 90,
        crop_top_percent: 10,
        prepared_in_browser: true,
        redaction_count: 2,
      },
      raw_image_stored_by_talent_signal: false,
      source_sha256: "a".repeat(64),
    });

    expect(meta.pre_provider_minimization).toEqual({
      crop_bottom_percent: 90,
      crop_top_percent: 10,
      prepared_in_browser: true,
      redaction_count: 2,
    });
    expect(meta.provider).toBe("Zhipu BigModel");
  });

  it("rejects a minimization receipt whose crop is too narrow", () => {
    expect(() =>
      validateScreenshotAnalysisMeta({
        provider: "OpenRouter",
        model: "google/gemini-3.5-flash-lite",
        prompt_version: "screenshot-evidence.v1",
        pre_provider_minimization: {
          crop_bottom_percent: 50,
          crop_top_percent: 45,
          prepared_in_browser: true,
          redaction_count: 1,
        },
        raw_image_stored_by_talent_signal: false,
        source_sha256: "a".repeat(64),
      }),
    ).toThrow();
  });
});
