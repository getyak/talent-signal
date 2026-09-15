import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { HarnessTool, HarnessToolObservation } from "./claudeHarness.js";
import { ContactChatExtractionSchema, type ContactChatExtraction } from "./contactIntakeSchemas.js";
import { SCREENSHOT_PREPROCESS_FOLLOW_UP_REGION_LIMIT } from "./screenshotPreprocess.js";
import type { screenshotImageViews } from "./screenshotImageViews.js";

const Field = z.enum(["text", "speaker", "time", "identity"]);
const Reading = z.strictObject({
  read_receipt_id: z.uuid(), field: Field,
  status: z.enum(["clear", "unreadable", "not_shown"]),
  reading: z.string().trim().min(1).max(8_000).nullable(),
  speaker_side: z.enum(["left", "right", "unknown"]).optional(),
}).superRefine((value, context) => {
  if (value.speaker_side !== undefined && (value.field !== "speaker" || value.status !== "clear")) {
    context.addIssue({ code: "custom", path: ["speaker_side"], message: "speaker_side is valid only for a clear speaker reading." });
  }
}).describe("Your own original-pixel assessment. clear requires the exact visible text; unreadable/not_shown require null. For a clear speaker reading also record its visible left/right/unknown side. A corrected guess is clear, never a source uncertainty.");
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
const ContactNameCorrection = z.strictObject({
  value: ContactChatExtractionSchema.shape.contact_name,
  read_receipt_id: z.uuid(),
});
const MessageCorrection = z.strictObject({
  message_id: ContactChatExtractionSchema.shape.messages.element.shape.message_id,
  text: z.strictObject({ value: ContactChatExtractionSchema.shape.messages.element.shape.text,
    read_receipt_id: z.uuid() }).optional(),
  speaker_side: z.strictObject({ value: ContactChatExtractionSchema.shape.messages.element.shape.speaker_side,
    read_receipt_id: z.uuid() }).optional(),
  speaker_label: z.strictObject({ value: ContactChatExtractionSchema.shape.messages.element.shape.speaker_label,
    read_receipt_id: z.uuid() }).optional(),
  time_text: z.strictObject({ value: ContactChatExtractionSchema.shape.messages.element.shape.time_text,
    read_receipt_id: z.uuid() }).optional(),
}).refine(value => value.text || value.speaker_side || value.speaker_label || value.time_text,
  "At least one message field correction is required.");
const IdentityClueCorrection = z.strictObject({
  clue_index: z.number().int().min(0).max(11),
  value: z.strictObject({ value: ContactChatExtractionSchema.shape.identity_clues.element.shape.value,
    read_receipt_id: z.uuid() }).optional(),
  source_excerpt: z.strictObject({ value: ContactChatExtractionSchema.shape.identity_clues.element.shape.source_excerpt,
    read_receipt_id: z.uuid() }).optional(),
}).refine(value => value.value || value.source_excerpt,
  "At least one identity clue field correction is required.");
const CorrectionTarget = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("message"), message_id: ContactChatExtractionSchema.shape.messages.element.shape.message_id }),
  z.strictObject({ kind: z.literal("identity_clue"), clue_index: z.number().int().min(0).max(11) }),
  z.strictObject({ kind: z.literal("contact_name") }),
  z.strictObject({ kind: z.literal("source") }),
]);
export const ScreenshotCorrectionSchema = z.strictObject({
  images: z.array(z.strictObject({
    source_image_index: z.number().int().min(0).max(9),
    contact_name: ContactNameCorrection.optional(),
    message_corrections: z.array(MessageCorrection).max(24),
    identity_clue_corrections: z.array(IdentityClueCorrection).max(12),
    resolved_uncertainties: z.array(z.strictObject({
      uncertainty_index: z.number().int().min(0).max(14),
      read_receipt_id: z.uuid(),
      field: Field,
      target: CorrectionTarget,
    })).max(15),
    pixel_readings: z.array(Reading).max(24),
    uncertainties: z.array(Uncertainty).max(15),
  })).min(1).max(10),
});
const Region = z.strictObject({ left: z.number().int().min(0), top: z.number().int().min(0),
  width: z.number().int().min(1).max(1_400), height: z.number().int().min(1).max(1_400) });
export const ScreenshotDelegationSchema = z.strictObject({ source_image_index: z.number().int().min(0).max(9),
  region: Region, field: Field, uncertainty_index: z.number().int().min(0).max(14), target: CorrectionTarget });
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
const sameTarget = (left: z.infer<typeof CorrectionTarget>, right: z.infer<typeof CorrectionTarget>) =>
  JSON.stringify(left) === JSON.stringify(right);
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
export function screenshotSourceReview(views: Awaited<ReturnType<typeof screenshotImageViews>>,
  requiredSelections: readonly z.infer<typeof ScreenshotDelegationSchema>[] = [],
  baselines: readonly { source_image_index: number; extraction: ContactChatExtraction }[] = []) {
  const required=requiredSelections.map(selection=>ScreenshotDelegationSchema.parse(selection));
  const baselineBySource=new Map(baselines.map(item=>[item.source_image_index,
    ContactChatExtractionSchema.parse(item.extraction)]));
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
    if (receipts.size >= SCREENSHOT_PREPROCESS_FOLLOW_UP_REGION_LIMIT) return failure("CONTACT_IMAGE_READ_RECEIPT_LIMIT");
    const id = randomUUID();
    receipts.set(id, { id, index: Number(data.source_image_index), sourceHash: String(data.source_hash),
      region: Region.parse(data.region), order: ++order });
    return { ...result, content: result.content.map((block, index) => index === 0 && block.type === "text"
      ? { type: "text" as const, text: JSON.stringify({ ...data, read_receipt_id: id }) } : block) };
  } };
  const reviewTool: HarnessTool = {
    name: "record_screenshot_source_review", readOnly: true, alwaysLoad: true, schema: Reading,
    description: "Return your bounded source review after inspect_screenshot_region. This is ephemeral analysis, not product storage. Use your own returned read_receipt_id. Read all visible wording for the requested field exactly, without discussing prior guesses. clear requires literal reading; unreadable/not_shown require null. A clear speaker reading must also state the visible speaker_side. The SDK binds reviewer identity after this call.",
    execute: async (args, signal) => {
      signal.throwIfAborted();
      const reading = Reading.parse(args);
      const receipt = receipts.get(reading.read_receipt_id);
      if (!receipt?.actor || (reading.status === "clear") !== (reading.reading !== null)) return failure("CONTACT_IMAGE_REVIEW_INVALID");
      if (pendingReviews.size >= SCREENSHOT_PREPROCESS_FOLLOW_UP_REGION_LIMIT) return failure("CONTACT_IMAGE_REVIEW_LIMIT");
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
    const correctionMode=baselineBySource.size>0;
    const parsed = correctionMode ? ScreenshotCorrectionSchema.safeParse(input) : ScreenshotUnderstandingSchema.safeParse(input);
    if (!parsed.success) return { error: "CONTACT_IMAGE_UNDERSTANDING_SCHEMA_INVALID" };
    if (parsed.data.images.length !== views.manifest.length) return { error: "CONTACT_IMAGE_UNDERSTANDING_COUNT_INVALID" };
    for (const selection of delegatedSelections.values()) {
      if (!reviews.some(review => review.receipt.actor?.id && review.receipt.index === selection.source_image_index &&
        review.field === selection.field && JSON.stringify(review.receipt.region) === JSON.stringify(selection.region))) {
        return { error: "CONTACT_IMAGE_CHILD_REVIEW_REQUIRED" };
      }
    }
    const output: z.infer<typeof ContactChatExtractionSchema>[] = [];
    for (const [index, rawImage] of parsed.data.images.entries()) {
      const sourceIndex = views.manifest[index]!.source_image_index;
      const image=rawImage as z.infer<typeof ScreenshotUnderstandingSchema>["images"][number] |
        z.infer<typeof ScreenshotCorrectionSchema>["images"][number];
      if(correctionMode&&("source_image_index" in image)&&image.source_image_index!==sourceIndex)
        return {error:"CONTACT_IMAGE_SOURCE_INDEX_MISMATCH"};
      const own = new Map<string, PixelReading & { receipt: Receipt }>();
      for (const reading of image.pixel_readings) {
        const receipt = receipts.get(reading.read_receipt_id);
        const key = `${reading.read_receipt_id}:${reading.field}`;
        if (!receipt?.actor || receipt.actor.id !== null || receipt.index !== sourceIndex || own.has(key) ||
          (reading.status === "clear") !== (reading.reading !== null)) return { error: "CONTACT_IMAGE_OWN_READ_REQUIRED" };
        if ([...own.values()].some(prior => prior.field === reading.field && sameRegion(prior.receipt, receipt))) {
          return { error: "CONTACT_IMAGE_MULTIPLE_READINGS_FOR_SAME_REGION" };
        }
        own.set(key, { ...reading, receipt });
      }
      for(const selection of required.filter(item=>item.source_image_index===sourceIndex)){
        if(![...own.values()].some(reading=>reading.field===selection.field&&
          reading.receipt.region.left===selection.region.left&&reading.receipt.region.top===selection.region.top&&
          reading.receipt.region.width===selection.region.width&&reading.receipt.region.height===selection.region.height)){
          return {error:"CONTACT_IMAGE_REQUIRED_FOLLOW_UP_READ_MISSING"};
        }
      }
      // Consider only the latest assessment by each actual child for a field/region.
      const children = reviews.filter(review => review.receipt.index === sourceIndex && review.receipt.actor?.id !== null &&
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
      const isDeclaredCorrectionRead = (reading: PixelReading & { receipt: Receipt }, target?: z.infer<typeof CorrectionTarget>,
        uncertaintyIndex?: number) => !correctionMode ||
        required.some(selection => selection.source_image_index === sourceIndex && selection.field === reading.field &&
          selection.region.left === reading.receipt.region.left && selection.region.top === reading.receipt.region.top &&
          selection.region.width === reading.receipt.region.width && selection.region.height === reading.receipt.region.height &&
          (!target || sameTarget(selection.target, target)) &&
          (uncertaintyIndex === undefined || selection.uncertainty_index === uncertaintyIndex));
      const supported = (id: string | undefined, field: z.infer<typeof Field>, value?: string | null,
        target?: z.infer<typeof CorrectionTarget>, uncertaintyIndex?: number) => {
        const reading=id?own.get(`${id}:${field}`):undefined;
        if(!reading||!isDeclaredCorrectionRead(reading,target,uncertaintyIndex)||reading.status!=="clear"||
          disagreed.has(`${reading.read_receipt_id}:${reading.field}`))return false;
        return value===undefined||value===null||normalized(reading.reading)!.includes(normalized(value)!);
      };
      const exactlySupported = (id: string, field: z.infer<typeof Field>, value: string,
        target: z.infer<typeof CorrectionTarget>, uncertaintyIndex: number) => supported(id,field,value,target,uncertaintyIndex)&&
        normalized(own.get(`${id}:${field}`)?.reading??null)===normalized(value);
      const supportedNull = (id: string, field: z.infer<typeof Field>, target?: z.infer<typeof CorrectionTarget>) => {
        const reading=own.get(`${id}:${field}`);
        return Boolean(reading&&isDeclaredCorrectionRead(reading,target)&&reading.status!=="clear"&&image.uncertainties.some(item=>
          item.kind!=="visible_conflict"&&item.read_receipt_id===id&&item.field===field));
      };
      const supportedSpeakerSide = (id: string, value: "left"|"right"|"unknown", target: z.infer<typeof CorrectionTarget>,
        uncertaintyIndex?: number) => {
        const reading=own.get(`${id}:speaker`);
        return Boolean(reading&&isDeclaredCorrectionRead(reading,target,uncertaintyIndex)&&reading.status==="clear"&&
          reading.speaker_side===value&&!disagreed.has(`${reading.read_receipt_id}:${reading.field}`));
      };
      if(correctionMode){
        const correction=image as z.infer<typeof ScreenshotCorrectionSchema>["images"][number];
        const baseline=baselineBySource.get(sourceIndex);
        if(!baseline)return {error:"CONTACT_IMAGE_CORRECTION_BASELINE_MISSING"};
        const extraction=ContactChatExtractionSchema.parse(baseline);
        if(correction.contact_name){
          const update=correction.contact_name;
          const target={kind:"contact_name" as const};
          if(update.value===null?!supportedNull(update.read_receipt_id,"identity",target):
            !supported(update.read_receipt_id,"identity",update.value,target))return {error:"CONTACT_IMAGE_IDENTITY_NOT_IN_OWN_READING"};
          extraction.contact_name=update.value;
        }
        const seenMessages=new Set<string>();
        for(const patch of correction.message_corrections){
          if(seenMessages.has(patch.message_id))return {error:"CONTACT_IMAGE_DUPLICATE_MESSAGE_CORRECTION"};
          seenMessages.add(patch.message_id);
          const target=extraction.messages.find(message=>message.message_id===patch.message_id);
          if(!target)return {error:"CONTACT_IMAGE_MESSAGE_CORRECTION_TARGET_INVALID"};
          const receiptTarget={kind:"message" as const,message_id:patch.message_id};
          if(patch.text){if(!supported(patch.text.read_receipt_id,"text",patch.text.value,receiptTarget))return {error:"CONTACT_IMAGE_QUOTE_NOT_IN_OWN_READING"};target.text=patch.text.value;}
          if(patch.speaker_side){if(!supportedSpeakerSide(patch.speaker_side.read_receipt_id,patch.speaker_side.value,receiptTarget))return {error:"CONTACT_IMAGE_METADATA_NOT_IN_OWN_READING"};target.speaker_side=patch.speaker_side.value;}
          if(patch.speaker_label){const update=patch.speaker_label;if(update.value===null?!supportedNull(update.read_receipt_id,"speaker",receiptTarget):
            !supported(update.read_receipt_id,"speaker",update.value,receiptTarget))return {error:"CONTACT_IMAGE_METADATA_NOT_IN_OWN_READING"};target.speaker_label=update.value;}
          if(patch.time_text){const update=patch.time_text;if(update.value===null?!supportedNull(update.read_receipt_id,"time",receiptTarget):
            !supported(update.read_receipt_id,"time",update.value,receiptTarget))return {error:"CONTACT_IMAGE_METADATA_NOT_IN_OWN_READING"};target.time_text=update.value;}
        }
        const seenClues=new Set<number>();
        for(const patch of correction.identity_clue_corrections){
          if(seenClues.has(patch.clue_index))return {error:"CONTACT_IMAGE_DUPLICATE_IDENTITY_CORRECTION"};
          seenClues.add(patch.clue_index);
          const target=extraction.identity_clues[patch.clue_index];
          if(!target)return {error:"CONTACT_IMAGE_IDENTITY_CORRECTION_TARGET_INVALID"};
          const receiptTarget={kind:"identity_clue" as const,clue_index:patch.clue_index};
          if(patch.value){if(!supported(patch.value.read_receipt_id,"identity",patch.value.value,receiptTarget))return {error:"CONTACT_IMAGE_IDENTITY_NOT_IN_OWN_READING"};target.value=patch.value.value;}
          if(patch.source_excerpt){if(!supported(patch.source_excerpt.read_receipt_id,"identity",patch.source_excerpt.value,receiptTarget))return {error:"CONTACT_IMAGE_IDENTITY_NOT_IN_OWN_READING"};target.source_excerpt=patch.source_excerpt.value;}
          if(!normalized(target.source_excerpt)!.includes(normalized(target.value)!))return {error:"CONTACT_IMAGE_IDENTITY_NOT_IN_OWN_READING"};
        }
        const retainedValueSupported = (item: z.infer<typeof ScreenshotCorrectionSchema>["images"][number]["resolved_uncertainties"][number]) => {
          const target=item.target;
          if(!supported(item.read_receipt_id,item.field,undefined,target,item.uncertainty_index))return false;
          if(target.kind==="contact_name")return item.field==="identity"&&Boolean(extraction.contact_name)&&
            exactlySupported(item.read_receipt_id,item.field,extraction.contact_name!,target,item.uncertainty_index);
          if(target.kind==="message"){
            const message=extraction.messages.find(candidate=>candidate.message_id===target.message_id);
            if(!message)return false;
            if(item.field==="text")return exactlySupported(item.read_receipt_id,item.field,message.text,target,item.uncertainty_index);
            if(item.field==="time")return Boolean(message.time_text)&&
              exactlySupported(item.read_receipt_id,item.field,message.time_text!,target,item.uncertainty_index);
            if(item.field==="speaker")return message.speaker_side!=="unknown"&&
              supportedSpeakerSide(item.read_receipt_id,message.speaker_side,target,item.uncertainty_index)&&
              Boolean(message.speaker_label)&&
              exactlySupported(item.read_receipt_id,item.field,message.speaker_label!,target,item.uncertainty_index);
            return false;
          }
          if(target.kind==="identity_clue"&&item.field==="identity"){
            const clue=extraction.identity_clues[target.clue_index];
            if(!clue)return false;
            return exactlySupported(item.read_receipt_id,item.field,clue.value,target,item.uncertainty_index)&&
              exactlySupported(item.read_receipt_id,item.field,clue.source_excerpt,target,item.uncertainty_index);
          }
          return false;
        };
        const resolved=new Set<number>();
        for(const item of correction.resolved_uncertainties){
          if(item.target.kind==="source"||resolved.has(item.uncertainty_index)||!baseline.uncertainties[item.uncertainty_index]||
            !retainedValueSupported(item))return {error:"CONTACT_IMAGE_UNCERTAINTY_RESOLUTION_INVALID"};
          resolved.add(item.uncertainty_index);
        }
        extraction.uncertainties=[...baseline.uncertainties.filter((_,itemIndex)=>!resolved.has(itemIndex)),...uncertainties];
        if([...extraction.messages,...extraction.identity_clues].some(item=>item.source_image_index!==sourceIndex))
          return {error:"CONTACT_IMAGE_SOURCE_INDEX_MISMATCH"};
        output.push(ContactChatExtractionSchema.parse(extraction));
        continue;
      }
      const full=image as z.infer<typeof ScreenshotUnderstandingSchema>["images"][number];
      const needsPixels = views.manifest[index]!.overview.transform !== "original" || children.length > 0 || full.pixel_readings.length > 0;
      if (needsPixels) {
        const supportsFullExtraction = (id: string | undefined, field: z.infer<typeof Field>, value: string) => {
          const receipt = id ? receipts.get(id) : undefined;
          if (!receipt || receipt.actor?.id !== null || receipt.index !== sourceIndex) return false;
          if ([...own.values()].some(reading => reading.field === field && overlaps(reading.receipt, receipt) &&
            (reading.status !== "clear" || disagreed.has(`${reading.read_receipt_id}:${reading.field}`)))) return false;
          return [...own.values()].some(reading => reading.read_receipt_id === id &&
            (reading.field === field || reading.field === "text") && reading.status === "clear" &&
            !disagreed.has(`${reading.read_receipt_id}:${reading.field}`) && normalized(reading.reading)!.includes(normalized(value)!));
        };
        for (const message of full.messages) {
          if (!supportsFullExtraction(message.source_read_receipt_id, "text", message.text)) return { error: "CONTACT_IMAGE_QUOTE_NOT_IN_OWN_READING" };
          if ((message.speaker_label && !supportsFullExtraction(message.source_read_receipt_id, "speaker", message.speaker_label)) ||
            (message.time_text && !supportsFullExtraction(message.source_read_receipt_id, "time", message.time_text))) {
            return { error: "CONTACT_IMAGE_METADATA_NOT_IN_OWN_READING" };
          }
          if (message.speaker_side !== "unknown" && [...own.values()].some(reading => reading.field === "speaker" &&
            overlaps(reading.receipt, receipts.get(message.source_read_receipt_id!)!) &&
            (reading.status !== "clear" || disagreed.has(`${reading.read_receipt_id}:${reading.field}`)))) {
            return { error: "CONTACT_IMAGE_UNRESOLVED_SPEAKER_SIDE" };
          }
        }
        if (full.identity_clues.some(clue => !supportsFullExtraction(clue.source_read_receipt_id, "identity", clue.source_excerpt) ||
          !normalized(clue.source_excerpt)!.includes(normalized(clue.value)!)) ||
          (full.contact_name && !supportsFullExtraction(full.contact_name_read_receipt_id, "identity", full.contact_name))) {
          return { error: "CONTACT_IMAGE_IDENTITY_NOT_IN_OWN_READING" };
        }
      }
      if ([...full.messages, ...full.identity_clues].some(item => item.source_image_index !== undefined && item.source_image_index !== sourceIndex)) {
        return { error: "CONTACT_IMAGE_SOURCE_INDEX_MISMATCH" };
      }
      const { pixel_readings: _readings, uncertainties: _uncertainties, contact_name_read_receipt_id: _nameRead, ...extraction } = full;
      output.push(ContactChatExtractionSchema.parse({ ...extraction, uncertainties,
        messages: full.messages.map(({ source_read_receipt_id: _read, ...message }) => message),
        identity_clues: full.identity_clues.map(({ source_read_receipt_id: _read, ...clue }) => clue) }));
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
  return { inspect, reviewTool, onToolCompleted, validate, failure, requireChildReview,
    schema:baselineBySource.size?ScreenshotCorrectionSchema:ScreenshotUnderstandingSchema };
}
