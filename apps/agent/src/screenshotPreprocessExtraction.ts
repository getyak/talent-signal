import {
  ContactChatExtractionSchema,
  type ContactChatExtraction,
} from "./contactIntakeSchemas.js";
import type { ScreenshotPreprocessSource } from "./screenshotPreprocess.js";

/**
 * Derive the existing unconfirmed chat proposal from preprocessing. Message
 * identifiers and order belong to captured evidence, not provider output.
 */
export function extractionFromPreprocess(source: ScreenshotPreprocessSource, messageOffset = 0): ContactChatExtraction {
  return ContactChatExtractionSchema.parse({
    platform: source.platform ?? "unknown",
    conversation_kind: source.conversation_kind,
    contact_name: source.contact_name,
    identity_clues: source.identity_clues.map(clue => ({
      ...clue,
      source_image_index: source.source_image_index,
    })),
    messages: source.messages.map((message, index) => ({
      message_id: `m${messageOffset + index + 1}`,
      sequence: messageOffset + index,
      text: message.text,
      speaker_side: message.speaker_side,
      speaker_label: message.speaker_label,
      time_text: message.time_text,
      source_image_index: source.source_image_index,
    })),
    uncertainties: source.uncertainties,
  });
}
