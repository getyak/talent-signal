import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { evidenceImageTools } from "./evidenceImageTool.js";
import type { RemoteChatAnswerRequest } from "./chatAnswerProvider.js";

async function fixture() {
  const bytes = await sharp({create:{width:20,height:20,channels:3,background:"red"}}).png().toBuffer();
  const id = randomUUID();
  const source = {evidence_id:id,task_id:randomUUID(),source_resource_id:randomUUID(),source_image_index:3,
    image:{media_type:"image/png" as const,byte_size:bytes.length,content_hash:createHash("sha256").update(bytes).digest("hex"),data_base64:bytes.toString("base64")},
    assertCurrent:vi.fn(async()=>{})};
  const request:RemoteChatAnswerRequest = {objective:"Verify the source",context_blocks:[],allowed_citation_ids:[id],
    assertCurrent:vi.fn(async()=>{}),readEvidenceImage:vi.fn(async()=>source)};
  return {request,source,id,signal:new AbortController().signal};
}

describe("Memory original-image capability",()=>{
  it("preserves the original fourth-image index and reads again instead of retaining a pixel cache",async()=>{
    const {request,source,id,signal}=await fixture();const tool=evidenceImageTools(request,true)[0]!;
    const overview=await tool.execute({evidence_id:id},signal);
    expect(overview.content.some(block=>block.type==="image")).toBe(true);
    expect(overview.content[0]).toMatchObject({type:"text",text:expect.stringContaining('"source_image_index":3')});
    const tile=await tool.execute({evidence_id:id,tile_index:0},signal);
    expect(tile.content.some(block=>block.type==="image")).toBe(true);
    expect(tile.content[0]).toMatchObject({type:"text",text:expect.stringContaining(source.image.content_hash)});
    expect(request.readEvidenceImage).toHaveBeenCalledTimes(2);
    expect(source.assertCurrent).toHaveBeenCalled();
  });
  it("does not admit image access without processing permission, scope, or a current-source guard",async()=>{
    const {request,id,signal}=await fixture();
    expect(evidenceImageTools(request,false)).toEqual([]);
    expect(evidenceImageTools({...request,mode:"unscoped_conversation"},true)).toEqual([]);
    const {assertCurrent: _, ...withoutGuard} = request;
    expect(evidenceImageTools(withoutGuard,true)).toEqual([]);
    const denied=await evidenceImageTools(request,true)[0]!.execute({evidence_id:randomUUID()},signal);
    expect(denied.isError).toBe(true);expect(request.readEvidenceImage).not.toHaveBeenCalled();
    expect(id).toBeTruthy();
  });
  it("withholds pixels when image authority expires during view preparation",async()=>{
    const {request,source,id,signal}=await fixture();let checks=0;
    source.assertCurrent.mockImplementation(async()=>{if(++checks===2)throw new Error("IMAGE_EXPIRED");});
    await expect(evidenceImageTools(request,true)[0]!.execute({evidence_id:id},signal)).rejects.toThrow("IMAGE_EXPIRED");
  });
  it("does not return a source mapped to a different evidence ID",async()=>{
    const {request,source,id,signal}=await fixture();source.evidence_id=randomUUID();
    await expect(evidenceImageTools(request,true)[0]!.execute({evidence_id:id},signal)).rejects.toThrow("SCOPE_MISMATCH");
  });
});
