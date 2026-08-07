import { afterEach, describe, expect, it, vi } from "vitest";

import type { ScreenshotAnalysisMeta } from "../screenshot-capture";
import { parseScreenshotCaptureDraft } from "../screenshot-capture";
import {
  issueScreenshotAnalysisReceipt,
  verifyScreenshotAnalysisReceipt,
} from "./screenshot-analysis-receipt";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("screenshot analysis receipt", () => {
  it("binds the provider metadata and complete reviewed draft", () => {
    vi.stubEnv("TALENT_SIGNAL_ANALYSIS_RECEIPT_SECRET", "receipt-test-secret");
    const draft = parseScreenshotCaptureDraft(
      JSON.stringify({
        platform: "line",
        captured_at: null,
        transcription_notes: [],
        messages: [
          { source_message_id: "m1", speaker: "unknown", text: "確認します" },
        ],
        assertions: [],
        action: null,
      }),
    );
    const meta: ScreenshotAnalysisMeta = {
      provider: "OpenRouter",
      model: "anthropic/claude-opus-5",
      request_id: "generation-1",
      prompt_version: "screenshot-evidence.v2",
      source_sha256: "b".repeat(64),
      raw_image_stored_by_talent_signal: false,
    };
    const receipt = issueScreenshotAnalysisReceipt({ draft, meta });

    expect(verifyScreenshotAnalysisReceipt(receipt, { draft, meta })).toBe(true);
    expect(
      verifyScreenshotAnalysisReceipt(receipt, {
        draft: {
          ...draft,
          messages: [{ ...draft.messages[0]!, text: "changed" }],
        },
        meta,
      }),
    ).toBe(false);
    expect(
      verifyScreenshotAnalysisReceipt(`${receipt}x`, { draft, meta }),
    ).toBe(false);
  });
});
