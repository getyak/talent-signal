import { ASSERTION_FIELDS } from "@talent-signal/contracts";
import { z } from "zod";

const assertionFieldSchema = z.enum(ASSERTION_FIELDS);
const speakerSchema = z.enum(["candidate", "recruiter", "unknown"]);

const rawScreenshotDraftSchema = z.object({
  platform: z.enum(["wechat", "unknown"]),
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
  platform: "wechat" | "unknown";
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

  const assertions = parsed.assertions.map((assertion) => {
    const message = messagesById.get(assertion.evidence_message_id);
    if (!message || !message.text.includes(assertion.evidence_quote)) {
      throw new Error("A proposed fact does not contain an exact source quote.");
    }
    if (
      assertion.status === "proposed" &&
      message.speaker !== "candidate"
    ) {
      throw new Error(
        "A candidate fact cannot be confirmed from a non-candidate message.",
      );
    }
    return {
      ...assertion,
      value: assertion.value.trim(),
      evidence_quote: assertion.evidence_quote.trim(),
      ambiguity: assertion.ambiguity?.trim() ?? null,
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
    captured_at: parsed.captured_at,
    transcription_notes: parsed.transcription_notes.map((note) =>
      note.trim(),
    ),
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
