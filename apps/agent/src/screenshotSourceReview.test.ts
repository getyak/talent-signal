import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { screenshotImageViews } from "./screenshotImageViews.js";
import { screenshotSourceReview } from "./screenshotSourceReview.js";

const signal = () => new AbortController().signal;
const region = { left: 0, top: 0, width: 300, height: 200 };
const extraction = () => ({ platform: "synthetic", conversation_kind: "comments", contact_name: null,
  identity_clues: [], messages: [], pixel_readings: [] as any[], uncertainties: [] as any[] });
const textReading = (id: string, reading: string | null = "Mira: Document reference DOCIOS-test") => ({
  read_receipt_id: id, field: "text", status: reading === null ? "unreadable" : "clear", reading,
});
async function setup(height = 400) {
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
  const subject = screenshotSourceReview(views);
  const read = async (actor: string | null = null, selected = region, bind = true) => {
    const input = { source_image_index: 0, region: selected };
    const result = await subject.inspect.execute(input, signal());
    if (bind) subject.onToolCompleted({ name: subject.inspect.name, input, result: result.content, agentID: actor,
      agentType: actor ? "screenshot-source-review" : null });
    const block = result.content[0]!;
    return { id: block.type === "text" ? JSON.parse(block.text).read_receipt_id as string : "", result, input };
  };
  const childReview = async (reading = "Mira: Document reference DOCIOS-test", actor = "child") => {
    subject.requireChildReview({ source_image_index: 0, region, field: "text" });
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
    subject.requireChildReview({ source_image_index: 0, region, field: "text" });
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
});
