import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { HarnessTool, HarnessToolObservation } from "./claudeHarness.js";
import { ContactChatExtractionSchema } from "./contactIntakeSchemas.js";
import type { screenshotImageViews } from "./screenshotImageViews.js";

const Field = z.enum(["text", "speaker", "time", "identity"]);
const Reading = z.strictObject({
  read_receipt_id: z.uuid(), field: Field,
  status: z.enum(["clear", "unreadable", "not_shown"]),
  reading: z.string().trim().min(1).max(8_000).nullable(),
}).describe("Your own original-pixel assessment. clear requires the exact visible text; unreadable/not_shown require null. A corrected guess is clear, never a source uncertainty.");
const Uncertainty = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.enum(["unreadable_region", "missing_context", "reader_disagreement"]),
    read_receipt_id: z.uuid(), field: Field }),
  z.strictObject({ kind: z.literal("visible_conflict"), first_read_receipt_id: z.uuid(),
    second_read_receipt_id: z.uuid(), field: Field }),
]);
export const ScreenshotUnderstandingSchema = z.strictObject({
  images: z.array(ContactChatExtractionSchema.omit({ uncertainties: true }).extend({
    contact_name_read_receipt_id: z.uuid().optional(),
    messages: z.array(ContactChatExtractionSchema.shape.messages.element.extend({
      source_read_receipt_id: z.uuid().optional().describe("Your own read receipt for this message and its speaker/time. Required for scaled images or a source review."),
    })).max(100),
    identity_clues: z.array(ContactChatExtractionSchema.shape.identity_clues.element.extend({
      source_read_receipt_id: z.uuid().optional().describe("Your own read receipt containing this exact clue and excerpt. Required for scaled images or a source review."),
    })).max(12),
    pixel_readings: z.array(Reading).max(24),
    uncertainties: z.array(Uncertainty).max(15).describe("Only unresolved, region-scoped source gaps or explicit reader disagreement. Task ownership comes from task state; processing history and synthetic labels do not belong here."),
  })).min(1).max(10),
});
const Region = z.strictObject({ left: z.number().int().min(0), top: z.number().int().min(0),
  width: z.number().int().min(1).max(1_400), height: z.number().int().min(1).max(1_400) });
export const ScreenshotDelegationSchema = z.strictObject({ source_image_index: z.number().int().min(0).max(9),
  region: Region, field: Field });
type Rect = z.infer<typeof Region>;
type PixelReading = z.infer<typeof Reading>;
type Receipt = { id: string; index: number; sourceHash: string; region: Rect; order: number;
  actor?: { id: string | null; type: string | null } };
type Review = PixelReading & { id: string; receipt: Receipt; order: number };
const normalized = (value: string | null) => value?.replace(/\s+/gu, " ").trim() ?? null;
const sameRegion = (a: Receipt, b: Receipt) => a.index === b.index && a.sourceHash === b.sourceHash &&
  a.region.left === b.region.left && a.region.top === b.region.top && a.region.width === b.region.width && a.region.height === b.region.height;
const overlaps = (a: Receipt, b: Receipt) => a.index === b.index && a.region.left < b.region.left + b.region.width &&
  b.region.left < a.region.left + a.region.width && a.region.top < b.region.top + b.region.height && b.region.top < a.region.top + a.region.height;
const contains = (outer: Receipt, inner: Receipt) => outer.index === inner.index &&
  outer.region.left <= inner.region.left && outer.region.top <= inner.region.top &&
  outer.region.left + outer.region.width >= inner.region.left + inner.region.width &&
  outer.region.top + outer.region.height >= inner.region.top + inner.region.height;
const location = (receipt: Receipt) => `original image ${receipt.index + 1}, region (${receipt.region.left}, ${receipt.region.top}, ${receipt.region.width}, ${receipt.region.height})`;
function metadata(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object" || ("isError" in result && result.isError)) return null;
  // SDK 0.3.260 PostToolUse supplies the MCP content array, whereas the local
  // tool execute boundary supplies {content}. Both contain host-issued IDs.
  const content = Array.isArray(result) ? result : "content" in result && Array.isArray(result.content) ? result.content : [];
  const first = content.find((item: unknown) => item && typeof item === "object" && "type" in item && item.type === "text");
  try { return first && typeof first.text === "string" ? JSON.parse(first.text) : null; } catch { return null; }
}

/** Ephemeral provenance, not another evidence store. SDK hooks bind the reader;
 * model-supplied identity and a content hash alone never establish a read. */
export function screenshotSourceReview(views: Awaited<ReturnType<typeof screenshotImageViews>>) {
  const receipts = new Map<string, Receipt>();
  const pendingReviews = new Map<string, Review>();
  const reviews: Review[] = [];
  const delegatedSelections = new Map<string, z.infer<typeof ScreenshotDelegationSchema>>();
  let order = 0;
  const failure = (error: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error,
    instruction: "Nothing was recorded. Use your own successful current-Run native read receipts. After a child review, reread its exact region. Separate unresolved source gaps from corrected guesses; do not drop genuine uncertainty. For remaining reader disagreement omit the disputed quotation and ask for human review." }) }], isError: true });
  const inspect: HarnessTool = { ...views.tool, execute: async (args, signal) => {
    const result = await views.tool.execute(args, signal);
    signal.throwIfAborted();
    const data = metadata(result);
    if (!data || !result.content.some(item => item.type === "image")) return result;
    if (receipts.size >= 24) return failure("CONTACT_IMAGE_READ_RECEIPT_LIMIT");
    const id = randomUUID();
    receipts.set(id, { id, index: Number(data.source_image_index), sourceHash: String(data.source_hash),
      region: Region.parse(data.region), order: ++order });
    return { ...result, content: result.content.map((block, index) => index === 0 && block.type === "text"
      ? { type: "text" as const, text: JSON.stringify({ ...data, read_receipt_id: id }) } : block) };
  } };
  const reviewTool: HarnessTool = {
    name: "record_screenshot_source_review", readOnly: true, alwaysLoad: true, schema: Reading,
    description: "Return your bounded source review after inspect_screenshot_region. This is ephemeral analysis, not product storage. Use your own returned read_receipt_id. Read all visible wording for the requested field exactly, without discussing prior guesses. clear requires literal reading; unreadable/not_shown require null. The SDK binds reviewer identity after this call.",
    execute: async (args, signal) => {
      signal.throwIfAborted();
      const reading = Reading.parse(args);
      const receipt = receipts.get(reading.read_receipt_id);
      if (!receipt?.actor || (reading.status === "clear") !== (reading.reading !== null)) return failure("CONTACT_IMAGE_REVIEW_INVALID");
      if (pendingReviews.size >= 24) return failure("CONTACT_IMAGE_REVIEW_LIMIT");
      const id = randomUUID();
      pendingReviews.set(id, { ...reading, id, receipt, order: ++order });
      return { content: [{ type: "text", text: JSON.stringify({ review_id: id, ...reading,
        source_image_index: receipt.index, region: receipt.region, status_note: "Unconfirmed source analysis; no product write." }) }] };
    },
  };
  const onToolCompleted = (event: HarnessToolObservation) => {
    const data = metadata(event.result);
    if (!data) return;
    if (event.name === inspect.name) {
      const receipt = receipts.get(String(data.read_receipt_id));
      if (receipt && !receipt.actor) receipt.actor = { id: event.agentID, type: event.agentType };
    } else if (event.name === reviewTool.name) {
      const review = pendingReviews.get(String(data.review_id));
      if (!review) return;
      pendingReviews.delete(review.id);
      if (review.receipt.actor?.id === event.agentID && review.receipt.actor.type === event.agentType) {
        review.order = ++order;
        reviews.push(review);
      }
    }
  };
  const validate = (input: unknown): { images: z.infer<typeof ContactChatExtractionSchema>[] } | { error: string } => {
    const parsed = ScreenshotUnderstandingSchema.safeParse(input);
    if (!parsed.success) return { error: "CONTACT_IMAGE_UNDERSTANDING_SCHEMA_INVALID" };
    if (parsed.data.images.length !== views.manifest.length) return { error: "CONTACT_IMAGE_UNDERSTANDING_COUNT_INVALID" };
    for (const selection of delegatedSelections.values()) {
      if (!reviews.some(review => review.receipt.actor?.id && review.receipt.index === selection.source_image_index &&
        review.field === selection.field && JSON.stringify(review.receipt.region) === JSON.stringify(selection.region))) {
        return { error: "CONTACT_IMAGE_CHILD_REVIEW_REQUIRED" };
      }
    }
    const output: z.infer<typeof ContactChatExtractionSchema>[] = [];
    for (const [index, image] of parsed.data.images.entries()) {
      const own = new Map<string, PixelReading & { receipt: Receipt }>();
      for (const reading of image.pixel_readings) {
        const receipt = receipts.get(reading.read_receipt_id);
        const key = `${reading.read_receipt_id}:${reading.field}`;
        if (!receipt?.actor || receipt.actor.id !== null || receipt.index !== index || own.has(key) ||
          (reading.status === "clear") !== (reading.reading !== null)) return { error: "CONTACT_IMAGE_OWN_READ_REQUIRED" };
        if ([...own.values()].some(prior => prior.field === reading.field && sameRegion(prior.receipt, receipt))) {
          return { error: "CONTACT_IMAGE_MULTIPLE_READINGS_FOR_SAME_REGION" };
        }
        own.set(key, { ...reading, receipt });
      }
      // Consider only the latest assessment by each actual child for a field/region.
      const children = reviews.filter(review => review.receipt.index === index && review.receipt.actor?.id !== null &&
        !reviews.some(next => next.order > review.order && next.receipt.actor?.id === review.receipt.actor?.id &&
          next.field === review.field && sameRegion(next.receipt, review.receipt)));
      const disagreed = new Set<string>();
      for (const child of children) {
        const main = [...own.values()].find(reading => reading.field === child.field && sameRegion(reading.receipt, child.receipt) && reading.receipt.order > child.order);
        if (!main) return { error: "CONTACT_IMAGE_POST_REVIEW_READ_REQUIRED" };
        if (main.status !== child.status || normalized(main.reading) !== normalized(child.reading)) {
          const key = `${main.read_receipt_id}:${main.field}`;
          if (!image.uncertainties.some(item => item.kind === "reader_disagreement" && item.read_receipt_id === main.read_receipt_id && item.field === main.field)) {
            return { error: "CONTACT_IMAGE_READER_DISAGREEMENT_UNRESOLVED" };
          }
          disagreed.add(key);
        }
      }
      const uncertainties: string[] = [];
      for (const uncertainty of image.uncertainties) {
        if (uncertainty.kind === "visible_conflict") {
          const first = own.get(`${uncertainty.first_read_receipt_id}:${uncertainty.field}`);
          const second = own.get(`${uncertainty.second_read_receipt_id}:${uncertainty.field}`);
          if (!first || !second || first.status !== "clear" || second.status !== "clear" || overlaps(first.receipt, second.receipt) ||
            normalized(first.reading) === normalized(second.reading) || disagreed.has(`${first.read_receipt_id}:${first.field}`) ||
            disagreed.has(`${second.read_receipt_id}:${second.field}`)) return { error: "CONTACT_IMAGE_SOURCE_CONFLICT_REQUIRES_DISTINCT_REGIONS" };
          uncertainties.push(`The Agent reports different ${uncertainty.field} readings in ${location(first.receipt)} and ${location(second.receipt)}; the source conflict is unconfirmed.`);
        } else {
          const key = `${uncertainty.read_receipt_id}:${uncertainty.field}`;
          const reading = own.get(key);
          if (!reading || (uncertainty.kind === "reader_disagreement" ? !disagreed.has(key) : disagreed.has(key) ||
            reading.status !== (uncertainty.kind === "unreadable_region" ? "unreadable" : "not_shown") ||
            [...own.values()].some(other => other.field === reading.field && other.status === "clear" && contains(other.receipt, reading.receipt)))) {
            return { error: "CONTACT_IMAGE_UNCERTAINTY_CONTRADICTS_READING" };
          }
          uncertainties.push(uncertainty.kind === "reader_disagreement"
            ? `Readers disagree about ${uncertainty.field} in ${location(reading.receipt)}; no disputed reading is confirmed.`
            : uncertainty.kind === "unreadable_region"
              ? `The Agent could not reliably read ${uncertainty.field} in ${location(reading.receipt)}.`
              : `The Agent did not find ${uncertainty.field} within ${location(reading.receipt)}; this does not establish its absence elsewhere.`);
        }
      }
      if ([...own.values()].some(reading => reading.status !== "clear" && !image.uncertainties.some(item =>
        item.kind !== "visible_conflict" && item.read_receipt_id === reading.read_receipt_id && item.field === reading.field))) {
        return { error: "CONTACT_IMAGE_UNRESOLVED_READING_OMITTED" };
      }
      const needsPixels = views.manifest[index]!.overview.transform !== "original" || children.length > 0 || image.pixel_readings.length > 0;
      if (needsPixels) {
        const supported = (id: string | undefined, field: z.infer<typeof Field>, value: string) => {
          const receipt = id ? receipts.get(id) : undefined;
          if (!receipt || receipt.actor?.id !== null || receipt.index !== index) return false;
          if ([...own.values()].some(reading => reading.field === field && overlaps(reading.receipt, receipt) &&
            (reading.status !== "clear" || disagreed.has(`${reading.read_receipt_id}:${reading.field}`)))) return false;
          return [...own.values()].some(reading => reading.read_receipt_id === id &&
            (reading.field === field || reading.field === "text") && reading.status === "clear" &&
            !disagreed.has(`${reading.read_receipt_id}:${reading.field}`) && normalized(reading.reading)!.includes(normalized(value)!));
        };
        for (const message of image.messages) {
          if (!supported(message.source_read_receipt_id, "text", message.text)) return { error: "CONTACT_IMAGE_QUOTE_NOT_IN_OWN_READING" };
          if ((message.speaker_label && !supported(message.source_read_receipt_id, "speaker", message.speaker_label)) ||
            (message.time_text && !supported(message.source_read_receipt_id, "time", message.time_text))) {
            return { error: "CONTACT_IMAGE_METADATA_NOT_IN_OWN_READING" };
          }
          if (message.speaker_side !== "unknown" && [...own.values()].some(reading => reading.field === "speaker" &&
            overlaps(reading.receipt, receipts.get(message.source_read_receipt_id!)!) &&
            (reading.status !== "clear" || disagreed.has(`${reading.read_receipt_id}:${reading.field}`)))) {
            return { error: "CONTACT_IMAGE_UNRESOLVED_SPEAKER_SIDE" };
          }
        }
        if (image.identity_clues.some(clue => !supported(clue.source_read_receipt_id, "identity", clue.source_excerpt) ||
          !normalized(clue.source_excerpt)!.includes(normalized(clue.value)!)) ||
          (image.contact_name && !supported(image.contact_name_read_receipt_id, "identity", image.contact_name))) {
          return { error: "CONTACT_IMAGE_IDENTITY_NOT_IN_OWN_READING" };
        }
      }
      if ([...image.messages, ...image.identity_clues].some(item => item.source_image_index !== undefined && item.source_image_index !== index)) {
        return { error: "CONTACT_IMAGE_SOURCE_INDEX_MISMATCH" };
      }
      const { pixel_readings: _readings, uncertainties: _uncertainties, contact_name_read_receipt_id: _nameRead, ...extraction } = image;
      output.push(ContactChatExtractionSchema.parse({ ...extraction, uncertainties,
        messages: image.messages.map(({ source_read_receipt_id: _read, ...message }) => message),
        identity_clues: image.identity_clues.map(({ source_read_receipt_id: _read, ...clue }) => clue) }));
    }
    return { images: output };
  };
  const requireChildReview = (input: unknown) => {
    const selection = ScreenshotDelegationSchema.parse(input);
    const manifest = views.manifest.find(image => image.source_image_index === selection.source_image_index);
    if (!manifest || selection.region.left + selection.region.width > manifest.width ||
      selection.region.top + selection.region.height > manifest.height) throw new Error("CONTACT_IMAGE_REGION_OUT_OF_BOUNDS");
    delegatedSelections.set(JSON.stringify(selection), selection);
  };
  return { inspect, reviewTool, onToolCompleted, validate, failure, requireChildReview };
}
