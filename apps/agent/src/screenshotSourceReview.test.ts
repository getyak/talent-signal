import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { screenshotImageViews } from "./screenshotImageViews.js";
import { extractionFromPreprocess } from "./screenshotPreprocessExtraction.js";
import { screenshotSourceReview } from "./screenshotSourceReview.js";

const signal = () => new AbortController().signal;
const region = { left: 0, top: 0, width: 300, height: 200 };
const extraction = () => ({ platform: "synthetic", conversation_kind: "comments", contact_name: null,
  identity_clues: [], messages: [], pixel_readings: [] as any[], uncertainties: [] as any[] });
const textReading = (id: string, reading: string | null = "Mira: Document reference DOCIOS-test") => ({
  read_receipt_id: id, field: "text", status: reading === null ? "unreadable" : "clear", reading,
});
async function setup(height = 400, options: {
  required?: Parameters<typeof screenshotSourceReview>[1];
  baselines?: Parameters<typeof screenshotSourceReview>[2];
} = {}) {
  let revoked = false;
  const bytes = await sharp({ create: { width: 300, height, channels: 3, background: "white" } }).png().toBuffer();
  const image = { media_type: "image/png" as const, byte_size: bytes.length,
    content_hash: createHash("sha256").update(bytes).digest("hex"), data_base64: bytes.toString("base64") };
  const views = await screenshotImageViews([image], async operation => {
    if (revoked) throw new Error("SOURCE_REVOKED");
    const value = await operation();
    if (revoked) throw new Error("SOURCE_REVOKED");
    return value;
  }, signal());
  const subject = screenshotSourceReview(views, options.required, options.baselines);
  const read = async (actor: string | null = null, selected = region, bind = true) => {
    const input = { source_image_index: 0, region: selected };
    const result = await subject.inspect.execute(input, signal());
    if (bind) subject.onToolCompleted({ name: subject.inspect.name, input, result: result.content, agentID: actor,
      agentType: actor ? "screenshot-source-review" : null });
    const block = result.content[0]!;
    return { id: block.type === "text" ? JSON.parse(block.text).read_receipt_id as string : "", result, input };
  };
  const childReview = async (reading = "Mira: Document reference DOCIOS-test", actor = "child") => {
    subject.requireChildReview({ source_image_index: 0, region, field: "text", uncertainty_index: 0,
      target: { kind: "source" } });
    const child = await read(actor);
    const input = textReading(child.id, reading);
    const result = await subject.reviewTool.execute(input, signal());
    subject.onToolCompleted({ name: subject.reviewTool.name, input, result: result.content, agentID: actor, agentType: "screenshot-source-review" });
    return child;
  };
  return { subject, read, childReview, revoke: () => { revoked = true; } };
}

describe("current-Run screenshot source reviews", () => {
  it("rejects the resolved DOC/OS guess as uncertainty, then accepts a fresh own reading without it", async () => {
    const { subject, read, childReview } = await setup();
    const old = await read();
    await childReview();
    const value = extraction();
    value.pixel_readings = [textReading(old.id)];
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_POST_REVIEW_READ_REQUIRED" });
    const fresh = await read();
    value.pixel_readings = [textReading(fresh.id)];
    value.uncertainties = ["The reference was ambiguous, corrected from DOC/OS to DOCIOS."];
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_UNDERSTANDING_SCHEMA_INVALID" });
    value.uncertainties = [{ kind: "unreadable_region", read_receipt_id: fresh.id, field: "text" }];
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_CONTRADICTS_READING" });
    value.uncertainties = [];
    expect(subject.validate({ images: [value] })).toMatchObject({ images: [{ uncertainties: [] }] });
  });

  it("preserves bounded unreadable and missing-context assessments without claiming an entire image lacks identity", async () => {
    const { subject, read } = await setup();
    const own = await read();
    const value = extraction();
    value.pixel_readings = [textReading(own.id, null), { read_receipt_id: own.id, field: "identity", status: "not_shown", reading: null }];
    value.uncertainties = [{ kind: "unreadable_region", read_receipt_id: own.id, field: "text" },
      { kind: "missing_context", read_receipt_id: own.id, field: "identity" }];
    const result = subject.validate({ images: [value] });
    expect(result).toMatchObject({ images: [{ uncertainties: [expect.stringContaining("region (0, 0, 300, 200)"),
      expect.stringContaining("does not establish its absence elsewhere")] }] });
    value.uncertainties = [];
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_UNRESOLVED_READING_OMITTED" });
  });

  it("allows two distinct original regions to disagree but rejects two guesses about the same pixels", async () => {
    const { subject, read } = await setup();
    const first = await read();
    const second = await read(null, { ...region, top: 200 });
    const duplicate = await read();
    const value = extraction();
    value.pixel_readings = [textReading(first.id, "Start date: Monday"), textReading(second.id, "Start date: Tuesday")];
    value.uncertainties = [{ kind: "visible_conflict", first_read_receipt_id: first.id, second_read_receipt_id: second.id, field: "text" }];
    expect(subject.validate({ images: [value] })).toMatchObject({ images: [{ uncertainties: [expect.stringContaining("source conflict is unconfirmed")] }] });
    value.pixel_readings[1] = textReading(duplicate.id, "Start date: Tuesday");
    value.uncertainties[0].second_read_receipt_id = duplicate.id;
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_MULTIPLE_READINGS_FOR_SAME_REGION" });
  });

  it("keeps unresolved reader disagreement separate and denies transcription from a disputed reading", async () => {
    const { subject, read, childReview } = await setup();
    await childReview();
    const fresh = await read();
    const value = extraction();
    value.pixel_readings = [textReading(fresh.id, "Mira: Document reference DOC/OS-test")];
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_READER_DISAGREEMENT_UNRESOLVED" });
    value.uncertainties = [{ kind: "reader_disagreement", read_receipt_id: fresh.id, field: "text" }];
    expect(subject.validate({ images: [value] })).toMatchObject({ images: [{ uncertainties: [expect.stringContaining("Readers disagree")] }] });
    (value.messages as any[]) = [{ message_id: "m1", sequence: 0, text: "Document reference DOC/OS-test",
      speaker_side: "unknown", speaker_label: "Mira", time_text: null }];
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_QUOTE_NOT_IN_OWN_READING" });
  });

  it("rejects fabricated, unbound, child-owned and previous-Run receipts", async () => {
    const { subject, read } = await setup();
    const other = await setup();
    const candidates = [randomUUID(), (await read(null, region, false)).id, (await read("child")).id, (await other.read()).id];
    for (const id of candidates) {
      const value = extraction(); value.pixel_readings = [textReading(id)];
      expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_OWN_READ_REQUIRED" });
    }
  });

  it("rejects explicit speaker/time/identity values while their bound source fields remain unresolved", async () => {
    const { subject, read } = await setup();
    const own = await read();
    const value = extraction();
    value.pixel_readings = [textReading(own.id, "Mira: Correct DOCIOS"),
      { read_receipt_id: own.id, field: "speaker", status: "unreadable", reading: null },
      { read_receipt_id: own.id, field: "time", status: "not_shown", reading: null },
      { read_receipt_id: own.id, field: "identity", status: "not_shown", reading: null }];
    value.uncertainties = [{ kind: "unreadable_region", read_receipt_id: own.id, field: "speaker" },
      { kind: "missing_context", read_receipt_id: own.id, field: "time" },
      { kind: "missing_context", read_receipt_id: own.id, field: "identity" }];
    const message = { source_read_receipt_id: own.id, message_id: "m1", sequence: 0, text: "Correct DOCIOS",
      speaker_side: "unknown", speaker_label: null as string | null, time_text: null as string | null };
    (value.messages as any[]) = [message];
    expect(subject.validate({ images: [value] })).toHaveProperty("images");
    for (const name of ["Tao", "Mira"]) {
      message.speaker_label = name;
      expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_METADATA_NOT_IN_OWN_READING" });
    }
    message.speaker_label = null; message.time_text = "2099-01-01";
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_METADATA_NOT_IN_OWN_READING" });
    message.time_text = null; message.speaker_side = "left";
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_UNRESOLVED_SPEAKER_SIDE" });
    message.speaker_side = "unknown";
    const identity = { ...value, contact_name: "Mira", contact_name_read_receipt_id: own.id };
    expect(subject.validate({ images: [identity] })).toEqual({ error: "CONTACT_IMAGE_IDENTITY_NOT_IN_OWN_READING" });
    (value.identity_clues as any[]) = [{ kind: "name", value: "Mira", source_excerpt: "Mira", source_read_receipt_id: own.id }];
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_IDENTITY_NOT_IN_OWN_READING" });
  });

  it("does not label a smaller region unreadable inside a region the same field reading declares clear", async () => {
    const { subject, read } = await setup();
    const clear = await read();
    const smaller = await read(null, { ...region, width: 100, height: 50 });
    const value = extraction();
    value.pixel_readings = [textReading(clear.id), textReading(smaller.id, null)];
    value.uncertainties = [{ kind: "unreadable_region", read_receipt_id: smaller.id, field: "text" }];
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_CONTRADICTS_READING" });
  });

  it("requires a completed child assessment and will not attribute another reader's review to that child", async () => {
    const { subject, read } = await setup();
    subject.requireChildReview({ source_image_index: 0, region, field: "text", uncertainty_index: 0,
      target: { kind: "source" } });
    const main = await read();
    const input = textReading(main.id);
    const result = await subject.reviewTool.execute(input, signal());
    subject.onToolCompleted({ name: subject.reviewTool.name, input, result, agentID: "child", agentType: "screenshot-source-review" });
    const value = extraction(); value.pixel_readings = [input];
    expect(subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_CHILD_REVIEW_REQUIRED" });
  });

  it("does not issue a successful receipt for failed reads or a revoked source", async () => {
    const { subject, read, revoke } = await setup();
    const failed = await read(null, { ...region, top: 9999 });
    expect(failed.result.isError).toBe(true); expect(failed.id).toBeUndefined();
    revoke();
    await expect(subject.inspect.execute({ source_image_index: 0, region }, signal())).rejects.toThrow("SOURCE_REVOKED");
  });

  it("allows an ordinary original overview without a mandatory read or child, while scaled transcriptions need original pixels", async () => {
    const plain = await setup();
    const long = await setup(2500);
    const value = extraction();
    (value.messages as any[]) = [{ message_id: "m1", sequence: 0, text: "Synthetic text", speaker_side: "unknown", speaker_label: null, time_text: null }];
    expect(plain.subject.validate({ images: [value] })).toHaveProperty("images");
    expect(long.subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_QUOTE_NOT_IN_OWN_READING" });
    (value.messages[0] as any).source_image_index = 1;
    expect(plain.subject.validate({ images: [value] })).toEqual({ error: "CONTACT_IMAGE_SOURCE_INDEX_MISMATCH" });
  });

  it("patches only a bounded speaker field while preserving every untouched baseline message", async () => {
    const baseline = { platform: "WeChat", conversation_kind: "direct" as const, contact_name: "Alex Chen",
      identity_clues: [{ kind: "name" as const, value: "Alex Chen", source_excerpt: "Alex Chen", source_image_index: 0 }],
      messages: [
        { message_id: "m1", sequence: 0, text: "First untouched message", speaker_side: "right" as const,
          speaker_label: "Me", time_text: null, source_image_index: 0 },
        { message_id: "m2", sequence: 1, text: "Second untouched message", speaker_side: "unknown" as const,
          speaker_label: null, time_text: null, source_image_index: 0 },
      ], uncertainties: ["The speaker for message m2 is unclear.", "A separate time is unclear."] };
    const { subject, read } = await setup(400, {
      required: [{ source_image_index: 0, region, field: "speaker", uncertainty_index: 0,
        target: { kind: "message", message_id: "m2" } }],
      baselines: [{ source_image_index: 0, extraction: baseline }],
    });
    const own = await read();
    const speakerReading = { read_receipt_id: own.id, field: "speaker" as const,
      status: "clear" as const, reading: "Alex Chen", speaker_side: "left" as const };
    const result = subject.validate({ images: [{ source_image_index: 0,
      message_corrections: [{ message_id: "m2",
        speaker_side: { value: "left", read_receipt_id: own.id },
        speaker_label: { value: "Alex Chen", read_receipt_id: own.id } }],
      identity_clue_corrections: [],
      resolved_uncertainties: [{ uncertainty_index: 0, read_receipt_id: own.id, field: "speaker",
        target: { kind: "message", message_id: "m2" } }],
      pixel_readings: [speakerReading], uncertainties: [] }] });
    expect(result).toEqual({ images: [{ ...baseline, uncertainties: ["A separate time is unclear."], messages: [baseline.messages[0],
      { ...baseline.messages[1], speaker_side: "left", speaker_label: "Alex Chen" }] }] });

    expect(subject.validate({ images: [{ source_image_index: 0,
      message_corrections: [{ message_id: "m1",
        speaker_side: { value: "left", read_receipt_id: own.id } }],
      identity_clue_corrections: [], resolved_uncertainties: [],
      pixel_readings: [speakerReading], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_METADATA_NOT_IN_OWN_READING" });

    expect(subject.validate({ images: [{ source_image_index: 0,
      message_corrections: [], identity_clue_corrections: [],
      resolved_uncertainties: [{ uncertainty_index: 0, read_receipt_id: own.id, field: "speaker",
        target: { kind: "message", message_id: "m1" } }],
      pixel_readings: [speakerReading], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_RESOLUTION_INVALID" });

    expect(subject.validate({ images: [{ source_image_index: 0,
      message_corrections: [], identity_clue_corrections: [],
      resolved_uncertainties: [{ uncertainty_index: 1, read_receipt_id: own.id, field: "speaker",
        target: { kind: "message", message_id: "m2" } }],
      pixel_readings: [speakerReading], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_RESOLUTION_INVALID" });

    const undeclared = await read(null, { ...region, height: 300 });
    const undeclaredReading = { ...speakerReading, read_receipt_id: undeclared.id };
    expect(subject.validate({ images: [{ source_image_index: 0,
      message_corrections: [{ message_id: "m2",
        speaker_side: { value: "left", read_receipt_id: undeclared.id } }],
      identity_clue_corrections: [], resolved_uncertainties: [],
      pixel_readings: [speakerReading, undeclaredReading], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_METADATA_NOT_IN_OWN_READING" });
  });

  it("does not clear an uncertainty unless the retained field matches its bound receipt", async () => {
    const baseline = { platform: "WeChat", conversation_kind: "direct" as const, contact_name: "Alex Chen",
      identity_clues: [], messages: [{ message_id: "m1", sequence: 0, text: "See you then",
        speaker_side: "left" as const, speaker_label: "Alex Chen", time_text: "Tuesday", source_image_index: 0 }],
      uncertainties: ["The visible day may be wrong."] };
    const { subject, read } = await setup(400, {
      required: [{ source_image_index: 0, region, field: "time", uncertainty_index: 0,
        target: { kind: "message", message_id: "m1" } }],
      baselines: [{ source_image_index: 0, extraction: baseline }],
    });
    const own = await read();
    const reading = { read_receipt_id: own.id, field: "time" as const,
      status: "clear" as const, reading: "Thursday, not Tuesday" };
    const resolution = { uncertainty_index: 0, read_receipt_id: own.id, field: "time" as const,
      target: { kind: "message" as const, message_id: "m1" } };
    expect(subject.validate({ images: [{ source_image_index: 0, message_corrections: [],
      identity_clue_corrections: [], resolved_uncertainties: [resolution], pixel_readings: [reading], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_RESOLUTION_INVALID" });
    expect(subject.validate({ images: [{ source_image_index: 0,
      message_corrections: [{ message_id: "m1", time_text: { value: "Tuesday", read_receipt_id: own.id } }],
      identity_clue_corrections: [], resolved_uncertainties: [resolution], pixel_readings: [reading], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_RESOLUTION_INVALID" });
    const exactReading = { ...reading, reading: "Thursday" };
    expect(subject.validate({ images: [{ source_image_index: 0,
      message_corrections: [{ message_id: "m1", time_text: { value: "Thursday", read_receipt_id: own.id } }],
      identity_clue_corrections: [], resolved_uncertainties: [resolution], pixel_readings: [exactReading], uncertainties: [] }] }))
      .toEqual({ images: [{ ...baseline, uncertainties: [], messages: [{ ...baseline.messages[0], time_text: "Thursday" }] }] });
  });

  it("keeps composite speaker and identity uncertainties until every retained member is supported", async () => {
    const speakerTarget = { kind: "message" as const, message_id: "m1" };
    const speakerRequired = [{ source_image_index: 0, region, field: "speaker" as const, uncertainty_index: 0,
      target: speakerTarget }];
    const wrongLabel = { platform: "WeChat", conversation_kind: "direct" as const, contact_name: null,
      identity_clues: [], messages: [{ message_id: "m1", sequence: 0, text: "Hello", speaker_side: "left" as const,
        speaker_label: "Wrong", time_text: null, source_image_index: 0 }], uncertainties: ["Speaker is unclear."] };
    const first = await setup(400, { required: speakerRequired,
      baselines: [{ source_image_index: 0, extraction: wrongLabel }] });
    const firstReceipt = await first.read();
    const firstReading = { read_receipt_id: firstReceipt.id, field: "speaker" as const,
      status: "clear" as const, reading: "Correct", speaker_side: "left" as const };
    expect(first.subject.validate({ images: [{ source_image_index: 0, message_corrections: [],
      identity_clue_corrections: [], resolved_uncertainties: [{ uncertainty_index: 0,
        read_receipt_id: firstReceipt.id, field: "speaker", target: speakerTarget }],
      pixel_readings: [firstReading], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_RESOLUTION_INVALID" });

    const unknownSide = { ...wrongLabel, messages: [{ message_id: "m1", sequence: 0, text: "Hello",
      speaker_side: "unknown" as const, speaker_label: "Correct", time_text: null, source_image_index: 0 }] };
    const second = await setup(400, { required: speakerRequired,
      baselines: [{ source_image_index: 0, extraction: unknownSide }] });
    const secondReceipt = await second.read();
    const secondReading = { ...firstReading, read_receipt_id: secondReceipt.id };
    expect(second.subject.validate({ images: [{ source_image_index: 0, message_corrections: [],
      identity_clue_corrections: [], resolved_uncertainties: [{ uncertainty_index: 0,
        read_receipt_id: secondReceipt.id, field: "speaker", target: speakerTarget }],
      pixel_readings: [secondReading], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_RESOLUTION_INVALID" });

    const missingLabel = { ...wrongLabel, messages: [{ message_id: "m1", sequence: 0, text: "Hello",
      speaker_side: "left" as const, speaker_label: null, time_text: null, source_image_index: 0 }] };
    const missing = await setup(400, { required: speakerRequired,
      baselines: [{ source_image_index: 0, extraction: missingLabel }] });
    const missingReceipt = await missing.read();
    const missingReading = { ...firstReading, read_receipt_id: missingReceipt.id };
    expect(missing.subject.validate({ images: [{ source_image_index: 0, message_corrections: [],
      identity_clue_corrections: [], resolved_uncertainties: [{ uncertainty_index: 0,
        read_receipt_id: missingReceipt.id, field: "speaker", target: speakerTarget }],
      pixel_readings: [missingReading], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_RESOLUTION_INVALID" });

    const clueTarget = { kind: "identity_clue" as const, clue_index: 0 };
    const wrongValue = { platform: "WeChat", conversation_kind: "direct" as const, contact_name: null,
      identity_clues: [{ kind: "name" as const, value: "Wrong", source_excerpt: "Correct", source_image_index: 0 }],
      messages: [], uncertainties: ["Identity clue is unclear."] };
    const third = await setup(400, { required: [{ source_image_index: 0, region, field: "identity",
      uncertainty_index: 0, target: clueTarget }], baselines: [{ source_image_index: 0, extraction: wrongValue }] });
    const thirdReceipt = await third.read();
    const identityReading = { read_receipt_id: thirdReceipt.id, field: "identity" as const,
      status: "clear" as const, reading: "Correct" };
    expect(third.subject.validate({ images: [{ source_image_index: 0, message_corrections: [],
      identity_clue_corrections: [], resolved_uncertainties: [{ uncertainty_index: 0,
        read_receipt_id: thirdReceipt.id, field: "identity", target: clueTarget }],
      pixel_readings: [identityReading], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_RESOLUTION_INVALID" });
  });

  it("keeps raw identity clue indices stable across target-bound correction", async () => {
    const firstRegion = { left: 0, top: 0, width: 120, height: 100 };
    const secondRegion = { left: 150, top: 0, width: 120, height: 100 };
    const baseline = extractionFromPreprocess({ source_image_index: 0, source_hash: "a".repeat(64),
      platform: "WeChat", conversation_kind: "direct", contact_name: "Alice", participants: [], messages: [],
      identity_clues: [{ kind: "name", value: "Alice", source_excerpt: "Bob" },
        { kind: "name", value: "Carol", source_excerpt: "Carol" }],
      uncertainties: ["First identity is unclear.", "Second identity is unclear."], follow_up_required: true,
      follow_up_regions: [], width: 300, height: 400,
      prepared_view: { transform: "auto-orient/native/webp92-v1", content_hash: "b".repeat(64), tile_count: 0 } });
    expect(baseline.identity_clues.map(clue => clue.value)).toEqual(["Alice", "Carol"]);
    const { subject, read } = await setup(400, { required: [
      { source_image_index: 0, region: firstRegion, field: "identity", uncertainty_index: 0,
        target: { kind: "identity_clue", clue_index: 0 } },
      { source_image_index: 0, region: secondRegion, field: "identity", uncertainty_index: 1,
        target: { kind: "identity_clue", clue_index: 1 } },
    ], baselines: [{ source_image_index: 0, extraction: baseline }] });
    const first = await read(null, firstRegion);const second = await read(null, secondRegion);
    const reading = (id:string,value:string) => ({ read_receipt_id:id, field:"identity" as const,
      status:"clear" as const, reading:value });
    const correction = (clueIndex:number,id:string,value:string) => ({ source_image_index:0,
      message_corrections:[],identity_clue_corrections:[{ clue_index:clueIndex,
        value:{ value,read_receipt_id:id },source_excerpt:{ value,read_receipt_id:id } }],
      resolved_uncertainties:[],pixel_readings:[reading(first.id,"Alice"),reading(second.id,"Carol")],uncertainties:[] });
    expect(subject.validate({ images:[correction(1,first.id,"Alice")] }))
      .toEqual({ error:"CONTACT_IMAGE_IDENTITY_NOT_IN_OWN_READING" });
    expect(subject.validate({ images:[correction(0,second.id,"Carol")] }))
      .toEqual({ error:"CONTACT_IMAGE_IDENTITY_NOT_IN_OWN_READING" });
    expect(subject.validate({ images:[correction(0,first.id,"Alice")] })).toMatchObject({
      images:[{ identity_clues:[{ value:"Alice" },{ value:"Carol" }] }],
    });
  });

  it("keeps a source-level omitted-item uncertainty until insertion is supported", async () => {
    const baseline = { platform: "WeChat", conversation_kind: "direct" as const, contact_name: null,
      identity_clues: [], messages: [], uncertainties: ["A source item may be omitted."] };
    const { subject, read } = await setup(400, {
      required: [{ source_image_index: 0, region, field: "text", uncertainty_index: 0,
        target: { kind: "source" } }],
      baselines: [{ source_image_index: 0, extraction: baseline }],
    });
    const own = await read();
    expect(subject.validate({ images: [{ source_image_index: 0,
      message_corrections: [], identity_clue_corrections: [],
      resolved_uncertainties: [{ uncertainty_index: 0, read_receipt_id: own.id, field: "text",
        target: { kind: "source" } }],
      pixel_readings: [textReading(own.id)], uncertainties: [] }] }))
      .toEqual({ error: "CONTACT_IMAGE_UNCERTAINTY_RESOLUTION_INVALID" });
  });
});
