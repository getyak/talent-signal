import { ASSERTION_FIELDS } from "@talent-signal/contracts";
import { z } from "zod";

export const SCREENSHOT_PLATFORMS = [
  "wechat",
  "whatsapp",
  "line",
  "boss_zhipin",
  "xiaohongshu",
  "unknown",
] as const;

export const SCREENSHOT_OWNER_ROLES = [
  "recruiter",
  "candidate",
  "unknown",
] as const;

export type ScreenshotPlatform = (typeof SCREENSHOT_PLATFORMS)[number];
export type ScreenshotOwnerRole = (typeof SCREENSHOT_OWNER_ROLES)[number];

export type ScreenshotAnalysisMeta = {
  provider: "Volcano Ark" | "OpenRouter";
  model: string;
  request_id?: string;
  prompt_version: string;
  pre_provider_minimization?: {
    crop_bottom_percent: number;
    crop_top_percent: number;
    prepared_in_browser: true;
    redaction_count: number;
  };
  source_sha256: string;
  raw_image_stored_by_talent_signal: false;
};

const screenshotAnalysisMetaSchema = z
  .object({
    provider: z.enum(["Volcano Ark", "OpenRouter"]),
    model: z.string().min(1).max(120),
    request_id: z.string().min(1).max(180).optional(),
    prompt_version: z.string().min(1).max(80),
    pre_provider_minimization: z
      .object({
        crop_bottom_percent: z.number().int().min(10).max(100),
        crop_top_percent: z.number().int().min(0).max(90),
        prepared_in_browser: z.literal(true),
        redaction_count: z.number().int().min(0).max(100),
      })
      .refine(
        (value) =>
          value.crop_bottom_percent - value.crop_top_percent >= 10,
        "The retained crop must cover at least ten percent of the image.",
      )
      .optional(),
    source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    raw_image_stored_by_talent_signal: z.literal(false),
  });

const assertionFieldSchema = z.enum(ASSERTION_FIELDS);
const speakerSchema = z.enum(["candidate", "recruiter", "unknown"]);

const rawScreenshotDraftSchema = z.object({
  platform: z.enum(SCREENSHOT_PLATFORMS),
  captured_at: z.string().max(80).nullable(),
  transcription_notes: z.array(z.string().min(1).max(180)).max(6),
  messages: z
    .array(
      z.object({
        source_message_id: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-zA-Z0-9:_-]+$/),
        speaker: speakerSchema,
        text: z.string().min(1).max(4_000),
      }),
    )
    .min(1)
    .max(80),
  assertions: z
    .array(
      z.object({
        field: assertionFieldSchema,
        status: z.enum(["proposed", "ambiguous"]),
        value: z.string().min(1).max(1_000),
        evidence_message_id: z.string().min(1).max(80),
        evidence_quote: z.string().min(1).max(800),
        ambiguity: z.string().min(1).max(180).nullable(),
      }),
    )
    .max(12),
  action: z
    .object({
      target: z.string().min(1).max(500),
      reason: z.string().min(1).max(800),
      due: z.string().min(1).max(160),
      evidence_message_ids: z
        .array(z.string().min(1).max(80))
        .min(1)
        .max(8),
    })
    .nullable(),
});

export type ScreenshotCaptureDraft = {
  schema_version: "screenshot-capture.v1";
  platform: ScreenshotPlatform;
  captured_at: string | null;
  transcription_notes: string[];
  messages: Array<{
    source_message_id: string;
    sequence: number;
    speaker: "candidate" | "recruiter" | "unknown";
    text: string;
  }>;
  assertions: Array<{
    field: (typeof ASSERTION_FIELDS)[number];
    status: "proposed" | "ambiguous";
    value: string;
    evidence_message_id: string;
    evidence_quote: string;
    ambiguity: string | null;
  }>;
  disposition: "propose_action" | "no_action" | "clarify";
  action: {
    target: string;
    reason: string;
    due: string;
    evidence_message_ids: string[];
  } | null;
};

function decodeJsonObject(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The model returned no JSON object.");
  }
  return JSON.parse(content.slice(start, end + 1));
}

function containsRelativeTimeReference(value: string) {
  return /(?:today|tomorrow|yesterday|this\s+(?:week|month)|next\s+(?:week|month)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|今天|明天|昨天|本周|这周|下周|周[一二三四五六日天]|星期[一二三四五六日天]|今日|明日|今週|来週|月曜|火曜|水曜|木曜|金曜|土曜|日曜)/iu.test(
    value,
  );
}

function verifiedCapturedAt(value: string | null) {
  if (
    value === null ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    return null;
  }
  return value;
}

function containsConcreteTimeReference(value: string) {
  return (
    containsRelativeTimeReference(value) ||
    /(?:\b\d{1,2}:\d{2}\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}\b|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}月\d{1,2}日|月底|月末)/iu.test(
      value,
    )
  );
}

export function parseScreenshotCaptureDraft(
  content: string,
): ScreenshotCaptureDraft {
  const parsed = rawScreenshotDraftSchema.parse(decodeJsonObject(content));
  const messages = parsed.messages.map((message, sequence) => ({
    ...message,
    text: message.text.trim(),
    sequence,
  }));
  const messagesById = new Map(
    messages.map((message) => [message.source_message_id, message]),
  );
  if (messagesById.size !== messages.length) {
    throw new Error("The transcription contains duplicate message IDs.");
  }
  const capturedAt = verifiedCapturedAt(parsed.captured_at);

  const assertions = parsed.assertions.map((assertion) => {
    const message = messagesById.get(assertion.evidence_message_id);
    if (!message || !message.text.includes(assertion.evidence_quote)) {
      throw new Error("A proposed fact does not contain an exact source quote.");
    }
    const temporalReferenceIsUnresolved =
      capturedAt === null &&
      (assertion.field === "availability" ||
        assertion.field === "decision_deadline") &&
      containsRelativeTimeReference(
        `${assertion.value}\n${assertion.evidence_quote}`,
      );
    const deadlineHasNoConcreteTime =
      assertion.field === "decision_deadline" &&
      !containsConcreteTimeReference(assertion.evidence_quote);
    const status =
      temporalReferenceIsUnresolved || deadlineHasNoConcreteTime
      ? ("ambiguous" as const)
      : assertion.status;
    if (
      status === "proposed" &&
      message.speaker !== "candidate"
    ) {
      throw new Error(
        "A candidate fact cannot be confirmed from a non-candidate message.",
      );
    }
    return {
      ...assertion,
      status,
      value: assertion.value.trim(),
      evidence_quote: assertion.evidence_quote.trim(),
      ambiguity: temporalReferenceIsUnresolved
        ? (assertion.ambiguity?.trim() ??
          "The source uses a relative date, but the screenshot capture time is not verified.")
        : deadlineHasNoConcreteTime
          ? (assertion.ambiguity?.trim() ??
            "The source asks to clarify timing but does not state a concrete decision deadline.")
        : (assertion.ambiguity?.trim() ?? null),
    };
  });

  const hasAmbiguity = assertions.some(
    (assertion) => assertion.status === "ambiguous",
  );
  const proposedEvidenceIds = new Set(
    assertions
      .filter((assertion) => assertion.status === "proposed")
      .map((assertion) => assertion.evidence_message_id),
  );
  const actionEvidenceIsSupported =
    parsed.action !== null &&
    parsed.action.evidence_message_ids.every((messageId) =>
      proposedEvidenceIds.has(messageId),
    );
  const action =
    !hasAmbiguity && actionEvidenceIsSupported ? parsed.action : null;
  const disposition = hasAmbiguity
    ? "clarify"
    : action
      ? "propose_action"
      : "no_action";

  return {
    schema_version: "screenshot-capture.v1",
    platform: parsed.platform,
    captured_at: capturedAt,
    transcription_notes: [
      ...parsed.transcription_notes.map((note) => note.trim()),
      ...(parsed.captured_at !== null && capturedAt === null
        ? [
            "A visible date was not retained as capture time because the screenshot does not verify a full timestamp and time zone.",
          ]
        : []),
    ],
    messages,
    assertions,
    disposition,
    action,
  };
}

export function validateScreenshotCaptureDraft(
  value: unknown,
): ScreenshotCaptureDraft {
  return parseScreenshotCaptureDraft(JSON.stringify(value));
}

export function validateReviewedScreenshotEdit(
  originalValue: unknown,
  reviewedValue: unknown,
): ScreenshotCaptureDraft {
  const original = validateScreenshotCaptureDraft(originalValue);
  const reviewed = validateScreenshotCaptureDraft(reviewedValue);
  if (
    original.schema_version !== reviewed.schema_version ||
    original.platform !== reviewed.platform ||
    original.captured_at !== reviewed.captured_at ||
    original.messages.length !== reviewed.messages.length ||
    JSON.stringify(original.transcription_notes) !==
      JSON.stringify(reviewed.transcription_notes)
  ) {
    throw new Error(
      "A reviewed transcription edit cannot change source metadata or message inventory.",
    );
  }
  let messageChanged = false;
  for (const [index, message] of reviewed.messages.entries()) {
    const source = original.messages[index];
    if (
      !source ||
      source.source_message_id !== message.source_message_id ||
      source.sequence !== message.sequence
    ) {
      throw new Error(
        "A reviewed transcription edit cannot add, remove, or reorder source messages.",
      );
    }
    if (source.text !== message.text || source.speaker !== message.speaker) {
      messageChanged = true;
    }
  }
  if (!messageChanged) {
    throw new Error("The reviewed transcription contains no human edit.");
  }
  if (
    reviewed.assertions.length > 0 ||
    reviewed.action !== null ||
    reviewed.disposition !== "no_action"
  ) {
    throw new Error(
      "Human-edited transcription must remove model-derived facts and actions before commit.",
    );
  }
  return reviewed;
}

export function validateScreenshotAnalysisMeta(
  value: unknown,
): ScreenshotAnalysisMeta {
  return screenshotAnalysisMetaSchema.parse(value);
}
