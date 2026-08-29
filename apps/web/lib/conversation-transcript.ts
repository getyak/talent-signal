export const CONVERSATION_TRANSCRIPT_PARSER = {
  name: "explicit-speaker-transcript",
  version: "1.0.0",
} as const;

export const CONVERSATION_SPEAKERS = [
  "candidate",
  "recruiter",
  "unknown",
] as const;

export type ConversationSpeaker =
  (typeof CONVERSATION_SPEAKERS)[number];

export type ConversationTranscriptMessage = {
  sequence: number;
  speaker: ConversationSpeaker;
  text: string;
};

export type ConversationTranscriptAnalysis = {
  messages: ConversationTranscriptMessage[];
  explicitly_labeled_count: number;
  unknown_count: number;
};

const MAX_TRANSCRIPT_CHARACTERS = 40_000;
const MAX_MESSAGES = 80;
const MAX_MESSAGE_CHARACTERS = 4_000;

const SPEAKER_LABELS: ReadonlyArray<{
  speaker: ConversationSpeaker;
  labels: readonly string[];
}> = [
  {
    speaker: "candidate",
    labels: ["candidate", "候选人", "候選人"],
  },
  {
    speaker: "recruiter",
    labels: ["recruiter", "招聘者", "招聘方", "獵頭", "猎头"],
  },
  {
    speaker: "unknown",
    labels: ["unknown", "unsure", "未知", "不确定", "不確定"],
  },
] as const;

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LABELED_LINE = new RegExp(
  `^\\s*(?:\\[\\s*)?(${SPEAKER_LABELS.flatMap((entry) => entry.labels)
    .map(escapePattern)
    .join("|")})(?:\\s*\\])?\\s*[:：]\\s*(.+?)\\s*$`,
  "i",
);

function speakerForLabel(value: string): ConversationSpeaker {
  const normalized = value.normalize("NFKC").toLowerCase();
  return (
    SPEAKER_LABELS.find((entry) =>
      entry.labels.some(
        (label) => label.normalize("NFKC").toLowerCase() === normalized,
      ),
    )?.speaker ?? "unknown"
  );
}

export function parseConversationTranscript(
  input: string,
  unlabeledSpeaker: ConversationSpeaker = "unknown",
): ConversationTranscriptAnalysis {
  if (!CONVERSATION_SPEAKERS.includes(unlabeledSpeaker)) {
    throw new Error("请为未标注消息选择受支持的说话人。")
  }
  const normalized = input.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    throw new Error("请先粘贴对话或选择文本文件。")
  }
  if (normalized.length > MAX_TRANSCRIPT_CHARACTERS) {
    throw new Error("对话文字最多 40,000 个字符。")
  }

  const messages: ConversationTranscriptMessage[] = [];
  let explicitlyLabeledCount = 0;
  for (const line of normalized.split("\n")) {
    const text = line.trim();
    if (!text) {
      continue;
    }
    const labeled = text.match(LABELED_LINE);
    const messageText = (labeled?.[2] ?? text).trim();
    const speaker = labeled?.[1]
      ? speakerForLabel(labeled[1])
      : unlabeledSpeaker;
    if (!messageText) {
      continue;
    }
    if (messageText.length > MAX_MESSAGE_CHARACTERS) {
      throw new Error(
        "Each transcript line is limited to 4,000 characters so evidence stays addressable.",
      );
    }
    if (messages.length >= MAX_MESSAGES) {
      throw new Error(
        "Conversation review is limited to 80 non-empty messages per source.",
      );
    }
    if (labeled) {
      explicitlyLabeledCount += 1;
    }
    messages.push({
      sequence: messages.length,
      speaker,
      text: messageText,
    });
  }
  if (messages.length === 0) {
    throw new Error("未找到可读取的对话消息。")
  }
  return {
    messages,
    explicitly_labeled_count: explicitlyLabeledCount,
    unknown_count: messages.filter((message) => message.speaker === "unknown")
      .length,
  };
}

export function validateReviewedConversationMessages(
  input: unknown,
): ConversationTranscriptMessage[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_MESSAGES) {
    throw new Error("请审阅 1 至 80 条对话消息。")
  }
  let totalCharacters = 0;
  return input.map((item, sequence) => {
    if (!item || typeof item !== "object") {
      throw new Error("每条对话消息都需要已审阅文字和说话人。")
    }
    const value = item as Record<string, unknown>;
    const text =
      typeof value.text === "string"
        ? value.text.normalize("NFKC").replace(/\s+/g, " ").trim()
        : "";
    const speaker = value.speaker;
    if (
      !text ||
      text.length > MAX_MESSAGE_CHARACTERS ||
      typeof speaker !== "string" ||
      !CONVERSATION_SPEAKERS.includes(speaker as ConversationSpeaker)
    ) {
      throw new Error("每条对话消息都需要已审阅文字和说话人。")
    }
    totalCharacters += text.length;
    if (totalCharacters > MAX_TRANSCRIPT_CHARACTERS) {
      throw new Error("对话文字最多 40,000 个字符。")
    }
    return {
      sequence,
      speaker: speaker as ConversationSpeaker,
      text,
    };
  });
}

export function reviewedConversationFragments(
  input: unknown,
  clientResourceId: string,
): EvidenceFragmentInput[] {
  if (!clientResourceId.trim() || clientResourceId.length > 128) {
    throw new Error("对话来源标识无效。")
  }
  return validateReviewedConversationMessages(input).map((message) => ({
    client_resource_id: clientResourceId,
    kind: "message",
    sequence: message.sequence,
    text: message.text,
    locator: {
      kind: "message",
      source_message_id: `transcript-message:${message.sequence + 1}`,
      sequence: message.sequence,
      speaker_side: "unknown",
    },
    attribution: {
      actor_kind: message.speaker,
      status: message.speaker === "unknown" ? "unknown" : "confirmed",
    },
    review_status: "proposed",
    parser: CONVERSATION_TRANSCRIPT_PARSER,
  }));
}
import type { EvidenceFragmentInput } from "@talent-signal/contracts";
