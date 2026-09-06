import { describe, expect, it } from "vitest";
import { ScreenshotContactTaskRequestSchema, type ContactChatExtraction } from "@talent-signal/agent";
import { mergeContactExtractions } from "./mergeContactExtractions.js";
import { validateContactImage } from "./contactTaskImages.js";
import { createHash } from "node:crypto";

const part = (name = "Lin"): ContactChatExtraction => ({platform:"IM",conversation_kind:"direct",contact_name:name,
  identity_clues:[],messages:[{message_id:"model-id",sequence:99,text:"Same overlapping message",speaker_side:"unknown",speaker_label:null,time_text:null}],uncertainties:[]});
describe("ordered screenshot batches", () => {
  it("preserves overlapping pixels as separate source observations with stable message/image provenance", () => {
    const result=mergeContactExtractions([part(),part()]);
    expect(result.question).toBeNull();
    expect(result.extraction?.messages.map(m=>[m.message_id,m.sequence,m.source_image_index,m.text])).toEqual([
      ["m1",0,0,"Same overlapping message"],["m2",1,1,"Same overlapping message"],
    ]);
  });
  it("does not silently file different contacts or drop unreadable images", () => {
    expect(mergeContactExtractions([part(),part("Someone else")])).toMatchObject({extraction:null,identityConflict:true});
    expect(mergeContactExtractions([part(),{...part(),messages:[]}])).toMatchObject({extraction:null,identityConflict:true});
  });
  it("bounds both image count and the whole encoded request while accepting legacy single images", () => {
    const image={media_type:"image/png",byte_size:1,content_hash:"a".repeat(64),data_base64:"AA=="};
    const request={idempotency_key:"one",objective:"Import",image,captured_at:new Date().toISOString()};
    expect(ScreenshotContactTaskRequestSchema.safeParse(request).success).toBe(true);
    expect(ScreenshotContactTaskRequestSchema.safeParse({...request,additional_images:Array(9).fill(image)}).success).toBe(true);
    expect(ScreenshotContactTaskRequestSchema.safeParse({...request,additional_images:Array(10).fill(image)}).success).toBe(false);
    expect(ScreenshotContactTaskRequestSchema.safeParse({...request,additional_images:Array(4).fill({...image,byte_size:10_000_000})}).success).toBe(false);
  });
  it("checks actual bytes, format and content hash rather than trusting the MIME label", () => {
    const body=Buffer.from([137,80,78,71,13,10,26,10,0]);
    const image={media_type:"image/png" as const,byte_size:body.length,content_hash:createHash("sha256").update(body).digest("hex"),data_base64:body.toString("base64")};
    expect(validateContactImage(image)).not.toHaveProperty("data_base64");
    expect(()=>validateContactImage({...image,content_hash:"f".repeat(64)})).toThrow();
    expect(()=>validateContactImage({...image,media_type:"image/jpeg"})).toThrow();
  });
});
