import type {
  PersonDirectoryItem,
  WorkspaceReviewResponse,
} from "@talent-signal/contracts";

import type {
  ScreenshotAnalysisMeta,
  ScreenshotCaptureDraft,
  ScreenshotOwnerRole,
} from "./screenshot-capture";

export type ScreenshotCaptureAnalysis = {
  draft: ScreenshotCaptureDraft;
  meta: ScreenshotAnalysisMeta;
  receipt: string;
};

export class ScreenshotCaptureRequestError extends Error {
  readonly outcome: "not_applied" | "unknown";
  readonly status: number | null;

  constructor(
    message: string,
    options: {
      cause?: unknown;
      outcome?: "not_applied" | "unknown";
      status?: number | null;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ScreenshotCaptureRequestError";
    this.outcome = options.outcome ?? "not_applied";
    this.status = options.status ?? null;
  }
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ScreenshotCaptureRequestError(
      response.ok
        ? "The server response could not be confirmed."
        : "服务器未返回可读的错误信息。",
      {
        cause,
        outcome: response.ok ? "unknown" : "not_applied",
        status: response.status,
      },
    );
  }
}

function messageFrom(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string" &&
    payload.message
  ) {
    return payload.message;
  }
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error
  ) {
    return payload.error;
  }
  return fallback;
}

export async function findScreenshotCapturePeople(
  query: string,
  signal: AbortSignal,
) {
  const response = await fetch(
    query
      ? "/api/local-integration/people/search"
      : "/api/local-integration/people",
    query
      ? {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
          signal,
        }
      : { cache: "no-store", signal },
  );
  const payload = await responseJson(response);
  if (
    !response.ok ||
    !payload ||
    typeof payload !== "object" ||
    !("people" in payload) ||
    !Array.isArray(payload.people)
  ) {
    throw new ScreenshotCaptureRequestError(
      messageFrom(payload, "Existing people could not be loaded."),
      { status: response.status },
    );
  }
  return payload.people as PersonDirectoryItem[];
}

export async function analyzeScreenshotCapture(input: {
  cropBottomPercent: number;
  cropTopPercent: number;
  image: File;
  redactionCount: number;
  screenshotOwner: ScreenshotOwnerRole;
  signal: AbortSignal;
}) {
  const formData = new FormData();
  formData.set("image", input.image);
  formData.set("screenshotOwner", input.screenshotOwner);
  formData.set("cropTopPercent", String(input.cropTopPercent));
  formData.set("cropBottomPercent", String(input.cropBottomPercent));
  formData.set("redactionCount", String(input.redactionCount));
  const response = await fetch("/api/captures/screenshot-analysis", {
    method: "POST",
    body: formData,
    cache: "no-store",
    signal: input.signal,
  });
  const payload = await responseJson(response);
  if (
    !response.ok ||
    !payload ||
    typeof payload !== "object" ||
    !("draft" in payload) ||
    !("meta" in payload) ||
    !("receipt" in payload)
  ) {
    throw new ScreenshotCaptureRequestError(
      messageFrom(payload, "The screenshot could not be analyzed."),
      { status: response.status },
    );
  }
  return payload as ScreenshotCaptureAnalysis;
}

export async function commitScreenshotCapture(input: {
  analysis: ScreenshotCaptureAnalysis;
  assignmentLabel: string;
  contactName: string;
  draft: ScreenshotCaptureDraft;
  identityQuery: string | null;
  personId: string | null;
  relationshipContextId: string | null;
  requestId: string;
}) {
  const transcriptEdited =
    JSON.stringify(input.draft.messages) !==
    JSON.stringify(input.analysis.draft.messages);
  let response: Response;
  try {
    response = await fetch("/api/local-integration/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: input.requestId,
        person_id: input.personId,
        relationship_context_id: input.relationshipContextId,
        contact_name: input.contactName.trim(),
        assignment_label: input.assignmentLabel.trim(),
        draft: input.draft,
        identity_query: input.identityQuery,
        ...(transcriptEdited
          ? { original_draft: input.analysis.draft }
          : {}),
        analysis_meta: input.analysis.meta,
        analysis_receipt: input.analysis.receipt,
      }),
    });
  } catch (cause) {
    throw new ScreenshotCaptureRequestError(
      "The commit result could not be confirmed.",
      { cause, outcome: "unknown" },
    );
  }

  let payload: unknown;
  try {
    payload = await responseJson(response);
  } catch (caught) {
    if (
      caught instanceof ScreenshotCaptureRequestError &&
      caught.outcome === "unknown"
    ) {
      throw new ScreenshotCaptureRequestError(
        "The commit result could not be confirmed.",
        {
          cause: caught,
          outcome: "unknown",
          status: response.status,
        },
      );
    }
    throw caught;
  }
  if (
    !response.ok ||
    !payload ||
    typeof payload !== "object" ||
    !("capture" in payload)
  ) {
    throw new ScreenshotCaptureRequestError(
      messageFrom(payload, "The reviewed capture could not be committed."),
      {
        outcome: response.ok ? "unknown" : "not_applied",
        status: response.status,
      },
    );
  }
  return payload as WorkspaceReviewResponse;
}
