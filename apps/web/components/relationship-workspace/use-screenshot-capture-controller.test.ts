import { describe, expect, it } from "vitest";

import {
  initialScreenshotCaptureState,
  screenshotCaptureControllerReducer,
} from "./use-screenshot-capture-controller";

describe("screenshot capture controller", () => {
  it("invalidates a prior identity decision when the contact query changes", () => {
    const state = {
      ...initialScreenshotCaptureState,
      assignmentLabel: "VP Product · Northstar",
      contactName: "Maya Chen",
      createNewContext: true,
      selectedContextId: "context-1",
      selectedPersonId: "person-1",
    };

    const next = screenshotCaptureControllerReducer(state, {
      type: "contact_changed",
      value: "Maya C",
    });

    expect(next).toMatchObject({
      assignmentLabel: "",
      contactName: "Maya C",
      createNewContext: false,
      createNewPerson: false,
      peopleLoading: true,
      selectedContextId: null,
      selectedPersonId: null,
    });
  });

  it("starts a replacement source with no stale analysis or request state", () => {
    const state = {
      ...initialScreenshotCaptureState,
      analysis: { draft: {}, meta: {}, receipt: "old" } as never,
      analysisStatus: "Outcome unknown",
      cropBottomPercent: 72,
      cropTopPercent: 18,
      error: "A previous error",
      phase: "review" as const,
      redactionMode: true,
      redactions: [
        { height: 0.1, id: "mask-1", width: 0.2, x: 0.1, y: 0.1 },
      ],
      reviewedDraft: {} as never,
      transcriptEditing: true,
    };

    const next = screenshotCaptureControllerReducer(state, {
      type: "file_selected",
      file: null,
    });

    expect(next).toMatchObject({
      analysis: null,
      analysisStatus: "",
      cropBottomPercent: 100,
      cropTopPercent: 0,
      error: "",
      phase: "select",
      redactionMode: false,
      redactions: [],
      reviewedDraft: null,
      transcriptEditing: false,
    });
  });

  it("keeps an unknown commit outcome visible and retryable", () => {
    const next = screenshotCaptureControllerReducer(
      {
        ...initialScreenshotCaptureState,
        phase: "committing",
      },
      {
        type: "commit_failed",
        error: "The commit result could not be confirmed.",
        outcomeUnknown: true,
      },
    );

    expect(next.phase).toBe("review");
    expect(next.error).toMatch(/could not be confirmed/i);
    expect(next.analysisStatus).toMatch(/same request ID/i);
    expect(next.analysisStatus).toMatch(/not create a duplicate/i);
  });

  it("makes cancellation explicit without discarding local minimization", () => {
    const state = {
      ...initialScreenshotCaptureState,
      cropBottomPercent: 84,
      cropTopPercent: 12,
      phase: "analyzing" as const,
      redactions: [
        { height: 0.1, id: "mask-1", width: 0.2, x: 0.1, y: 0.1 },
      ],
    };

    const next = screenshotCaptureControllerReducer(state, {
      type: "analysis_cancelled",
    });

    expect(next.phase).toBe("select");
    expect(next.cropTopPercent).toBe(12);
    expect(next.cropBottomPercent).toBe(84);
    expect(next.redactions).toHaveLength(1);
    expect(next.analysisStatus).toMatch(/No source was saved/i);
  });
});
