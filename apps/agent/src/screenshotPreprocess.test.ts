import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { ArkScreenshotPreprocessor } from "./arkScreenshotPreprocessor.js";
import { prepareScreenshotViews } from "./screenshotPreparedViews.js";
import { extractionFromPreprocess } from "./screenshotPreprocessExtraction.js";
import { withProductRunCapture, type ProductRunSpan } from "./productRunCapture.js";
import {
  ARK_SCREENSHOT_PREPROCESS_MODEL,
  SCREENSHOT_PREPROCESS_CONTRACT,
  SCREENSHOT_PREPROCESS_FOLLOW_UP_REGION_LIMIT,
  SCREENSHOT_PREPROCESS_PROMPT_VERSION,
  SCREENSHOT_PREPROCESS_SCHEMA_VERSION,
  ScreenshotPreprocessPacketSchema,
} from "./screenshotPreprocess.js";

async function image(width = 120, height = 240) {
  const bytes=await sharp({create:{width,height,channels:3,background:"white"}}).png().toBuffer();
  return {media_type:"image/png" as const,byte_size:bytes.length,
    content_hash:createHash("sha256").update(bytes).digest("hex"),data_base64:bytes.toString("base64")};
}

const modelOutput={platform:"WeChat",conversation_kind:"direct",contact_name:"Synthetic Person",
  participants:[{label:"我",side:"right",role_hint:"account_owner",visible_name:null}],
  messages:[{sequence:9,text:"Exact synthetic source",speaker_label:"我",speaker_side:"right",time_text:"09:30"}],
  identity_clues:[{kind:"name",value:"Synthetic Person",source_excerpt:"Synthetic Person"}],
  uncertainties:[],follow_up_regions:[]};

describe("screenshot-preprocess.v2",()=>{
  it("keeps ordinary views legible and tiles long screenshots with overlap",async()=>{
    const ordinary=await prepareScreenshotViews(await image(),0);
    expect(ordinary).toMatchObject({width:120,height:240,native_clarity:true,tiles:[]});
    expect(ordinary.overview.media_type).toBe("image/webp");
    const long=await prepareScreenshotViews(await image(720,3200),1);
    expect(long.native_clarity).toBe(false);
    expect(long.tiles.length).toBeGreaterThan(1);
    expect(long.tiles[1]!.region.top).toBeLessThan(long.tiles[0]!.region.height);
    expect(long.tiles.every(view=>view.byte_size<=4_000_000)).toBe(true);
  });

  it("pins Ark identity, disables thinking/storage, and emits source-grounded fields",async()=>{
    const source=await image();
    const spans:ProductRunSpan[]=[];
    const fetcher=vi.fn(async(_url:URL|string|Request,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body));
      expect(body).toMatchObject({model:ARK_SCREENSHOT_PREPROCESS_MODEL,thinking:{type:"disabled"},store:false,stream:false});
      expect(body.messages[0].content.some((part:{type:string})=>part.type==="image_url")).toBe(true);
      return new Response(JSON.stringify({id:"ark-request-1",model:ARK_SCREENSHOT_PREPROCESS_MODEL,
        choices:[{message:{content:JSON.stringify(modelOutput)}}],usage:{prompt_tokens:12,completion_tokens:8}}));
    }) as typeof fetch;
    const result=await withProductRunCapture({async append(span){spans.push(span);}},()=>
      new ArkScreenshotPreprocessor({apiKey:"synthetic",fetcher})
        .preprocess(source,0,new AbortController().signal));
    expect(result).toMatchObject({request_id:"ark-request-1",model:ARK_SCREENSHOT_PREPROCESS_MODEL,input_tokens:12,output_tokens:8,
      source:{source_image_index:0,source_hash:source.content_hash,platform:"WeChat",follow_up_required:false}});
    expect(extractionFromPreprocess(result.source)).toMatchObject({messages:[{message_id:"m1",sequence:0,
      text:"Exact synthetic source",source_image_index:0}],identity_clues:[{source_image_index:0}]});
    expect(extractionFromPreprocess({...result.source,source_image_index:1},3)).toMatchObject({
      messages:[{message_id:"m4",sequence:3,source_image_index:1}],
    });
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({status:"completed",output:{status:"complete",
      value:{request_id:"ark-request-1",model:ARK_SCREENSHOT_PREPROCESS_MODEL}}});
    expect(JSON.stringify(spans)).not.toContain("Exact synthetic source");
  });

  it("preserves provider identity positions for target-bound correction",async()=>{
    const source=await image();
    const output={...modelOutput,contact_name:"Alice",identity_clues:[
      {kind:"handle",value:"@alice",source_excerpt:"Visible handle: @bob"},
      {kind:"name",value:"Alice",source_excerpt:"Bob"},
      {kind:"company",value:"Alice",source_excerpt:"Company: Alice"},
      {kind:"profile_url",value:"https://example.com/alice",source_excerpt:"https://example.com/alice"},
    ]};
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({id:"ark-identity-grounding",model:ARK_SCREENSHOT_PREPROCESS_MODEL,
      choices:[{message:{content:JSON.stringify(output)}}]}))) as typeof fetch;
    const result=await new ArkScreenshotPreprocessor({apiKey:"synthetic",fetcher})
      .preprocess(source,0,new AbortController().signal);
    expect(result.source).toMatchObject({contact_name:"Alice",identity_clues:output.identity_clues});
    expect(extractionFromPreprocess(result.source)).toMatchObject({contact_name:"Alice",identity_clues:[
      {kind:"handle",value:"@alice",source_excerpt:"Visible handle: @bob",source_image_index:0},
      {kind:"name",value:"Alice",source_excerpt:"Bob",source_image_index:0},
      {kind:"company",value:"Alice",source_excerpt:"Company: Alice",source_image_index:0},
      {kind:"profile_url",value:"https://example.com/alice",source_excerpt:"https://example.com/alice",source_image_index:0},
    ]});
  });

  it("rejects provider model drift and out-of-bounds follow-up regions",async()=>{
    const source=await image();
    const response=(output:unknown,model:string=ARK_SCREENSHOT_PREPROCESS_MODEL)=>vi.fn(async()=>new Response(JSON.stringify({
      id:"ark-request-1",model,choices:[{message:{content:JSON.stringify(output)}}]}))) as typeof fetch;
    await expect(new ArkScreenshotPreprocessor({apiKey:"synthetic",fetcher:response(modelOutput,"latest")})
      .preprocess(source,0,new AbortController().signal)).rejects.toThrow("PROVIDER_IDENTITY_MISMATCH");
    await expect(new ArkScreenshotPreprocessor({apiKey:"synthetic",fetcher:response({...modelOutput,
      uncertainties:["Message text is unclear."],follow_up_regions:[{reason:"illegible_text",field:"text",uncertainty_index:0,
        target:{kind:"message",message_index:0},left:100,top:0,width:40,height:20}]})})
      .preprocess(source,0,new AbortController().signal)).rejects.toThrow("REGION_OUT_OF_BOUNDS");
    await expect(new ArkScreenshotPreprocessor({apiKey:"synthetic",fetcher:response({...modelOutput,
      uncertainties:["Message text is unclear."],follow_up_regions:[{reason:"illegible_text",field:"text",uncertainty_index:0,
        target:{kind:"message",message_index:0},left:0,top:0,width:120,height:1401}]})})
      .preprocess(source,0,new AbortController().signal)).rejects.toThrow();
  });

  it("fails the observed provider span before invalid private output can be retained",async()=>{
    const source=await image();
    const privateMarker="synthetic-private-invalid-output";
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({
      id:"ark-request-invalid",model:ARK_SCREENSHOT_PREPROCESS_MODEL,
      choices:[{message:{content:JSON.stringify({...modelOutput,unexpected_private_field:privateMarker})}}],
    }))) as typeof fetch;
    const spans:ProductRunSpan[]=[];
    await expect(withProductRunCapture({async append(span){spans.push(span);}},()=>
      new ArkScreenshotPreprocessor({apiKey:"synthetic",fetcher})
        .preprocess(source,0,new AbortController().signal)))
      .rejects.toThrow();
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({name:"contact.screenshot.preprocess",status:"failed",error:"Operation failed"});
    expect(JSON.stringify(spans)).not.toContain(privateMarker);
  });

  it("rejects aggregate follow-up regions beyond the global receipt budget", () => {
    const sources = Array.from({ length: 2 }, (_, sourceImageIndex) => ({
      source_image_index: sourceImageIndex,
      source_hash: String(sourceImageIndex + 1).repeat(64),
      ...modelOutput,
      follow_up_required: true,
      follow_up_regions: Array.from(
        { length: SCREENSHOT_PREPROCESS_FOLLOW_UP_REGION_LIMIT / 2 + 1 },
        (_, left) => ({
          reason: "illegible_text" as const,
          field: "text" as const,
          uncertainty_index: 0,
          target: { kind: "message" as const, message_index: 0 },
          region: { left, top: 0, width: 10, height: 10 },
        }),
      ),
      width: 120,
      height: 240,
      prepared_view: {
        transform: "auto-orient/native/webp92-v1",
        content_hash: "a".repeat(64),
        tile_count: 0,
      },
    }));
    expect(ScreenshotPreprocessPacketSchema.safeParse({
      contract_version: SCREENSHOT_PREPROCESS_CONTRACT,
      schema_version: SCREENSHOT_PREPROCESS_SCHEMA_VERSION,
      prompt_version: SCREENSHOT_PREPROCESS_PROMPT_VERSION,
      provider: "volcano_ark",
      model: ARK_SCREENSHOT_PREPROCESS_MODEL,
      request_receipts: sources.map((source) => ({
        source_image_index: source.source_image_index,
        request_id: `request-${source.source_image_index}`,
        input_tokens: 1,
        output_tokens: 1,
      })),
      usage: { input_tokens: 2, output_tokens: 2 },
      sources,
    }).success).toBe(false);
  });
});
