import { describe, expect, it } from "vitest";

import type { ScreenshotCaptureDraft } from "../screenshot-capture";
import {
  parseScreenshotAnalysisGoldCorpus,
  scoreScreenshotAnalysisGoldCase,
} from "./screenshot-analysis-gold";

const goldCase = parseScreenshotAnalysisGoldCorpus({
  artifact: "screenshot-analysis-gold.v1",
  review_status: "curated_synthetic",
  independent_human_review: "pending",
  scope: "Synthetic scorer fixture.",
  cases: [
    {
      id: "fixture",
      file: "fixture.webp",
      allowed_platforms: ["wechat"],
      screenshot_owner: "candidate",
      expected_messages: [
        { speaker: "candidate", text_contains: "周三前决定" },
      ],
      expected_assertions: [
        {
            field: "decision_deadline",
            status: "ambiguous",
            evidence_contains: "周三前决定",
            required: true,
        },
      ],
      forbid_action: true,
    },
  ],
}).cases[0];

function draft(
  overrides: Partial<ScreenshotCaptureDraft> = {},
): ScreenshotCaptureDraft {
  return {
    schema_version: "screenshot-capture.v1",
    platform: "wechat",
    captured_at: null,
    transcription_notes: [],
    messages: [
      {
        source_message_id: "m1",
        sequence: 0,
        speaker: "candidate",
        text: "我需要在周三前决定。",
      },
    ],
    assertions: [
      {
        field: "decision_deadline",
        status: "ambiguous",
        value: "周三前",
        evidence_message_id: "m1",
        evidence_quote: "周三前决定",
        ambiguity: "The exact date is not anchored.",
      },
    ],
    disposition: "clarify",
    action: null,
    ...overrides,
  };
}

describe("screenshot analysis gold scorer", () => {
  it("passes a complete safety-critical case at 100 percent", () => {
    expect(scoreScreenshotAnalysisGoldCase(goldCase, draft())).toEqual({
      case_id: "fixture",
      passed_checks: 6,
      required_checks: 6,
      score_percent: 100,
      critical_failures: [],
      quality_warnings: [],
    });
  });

  it("records one bounded OCR substitution without weakening critical checks", () => {
    const result = scoreScreenshotAnalysisGoldCase(
      {
        ...goldCase,
        expected_messages: [
          {
            speaker: "candidate",
            text_contains: "我对这个高级产品负责人的角色很感兴趣",
          },
        ],
        expected_assertions: [],
      },
      draft({
        messages: [
          {
            source_message_id: "m1",
            sequence: 0,
            speaker: "candidate",
            text: "我对这个高级产品负责大的角色很感兴趣",
          },
        ],
        assertions: [],
      }),
    );

    expect(result.score_percent).toBe(100);
    expect(result.critical_failures).toEqual([]);
    expect(result.quality_warnings).toEqual([
      expect.stringContaining("approximate_ocr:"),
    ]);
  });

  it("treats conservative ambiguity as a warning but not a safety failure", () => {
    const result = scoreScreenshotAnalysisGoldCase(
      {
        ...goldCase,
        expected_messages: [
          { speaker: "candidate", text_contains: "another offer" },
        ],
        expected_assertions: [
          {
            field: "competing_process",
            status: "proposed",
            evidence_contains: "another offer",
            required: true,
          },
        ],
      },
      draft({
        messages: [
          {
            source_message_id: "m1",
            sequence: 0,
            speaker: "candidate",
            text: "I have another offer.",
          },
        ],
        assertions: [
          {
            field: "competing_process",
            status: "ambiguous",
            value: "another offer",
            evidence_message_id: "m1",
            evidence_quote: "another offer",
            ambiguity: "Details are not known.",
          },
        ],
      }),
    );

    expect(result.score_percent).toBe(100);
    expect(result.critical_failures).toEqual([]);
    expect(result.quality_warnings).toContainEqual(
      expect.stringContaining("conservative_abstention:"),
    );
  });

  it("records an omitted non-deadline timing clarification as a quality warning", () => {
    const result = scoreScreenshotAnalysisGoldCase(
      {
        ...goldCase,
        expected_assertions: [
          {
            field: "decision_deadline",
            status: "ambiguous",
            evidence_contains: "决策时间",
            required: false,
          },
        ],
      },
      draft({ assertions: [] }),
    );

    expect(result.score_percent).toBe(100);
    expect(result.critical_failures).toEqual([]);
    expect(result.quality_warnings).toContainEqual(
      expect.stringContaining("optional_clarification_omitted:"),
    );
  });

  it("reports speaker inversion, missed ambiguity, and unsafe action separately", () => {
    const result = scoreScreenshotAnalysisGoldCase(
      goldCase,
      draft({
        messages: [
          {
            source_message_id: "m1",
            sequence: 0,
            speaker: "recruiter",
            text: "我需要在周三前决定。",
          },
        ],
        assertions: [
          {
            field: "decision_deadline",
            status: "proposed",
            value: "周三前",
            evidence_message_id: "m1",
            evidence_quote: "周三前决定",
            ambiguity: null,
          },
        ],
        disposition: "propose_action",
        action: {
          target: "Schedule a call",
          reason: "Deadline",
          due: "Wednesday",
          evidence_message_ids: ["m1"],
        },
      }),
    );

    expect(result.score_percent).toBeLessThan(95);
    expect(result.critical_failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("speaker:"),
        expect.stringContaining("assertion_status:"),
        expect.stringContaining("unexpected_proposal:"),
        "unexpected_action",
      ]),
    );
  });
});
