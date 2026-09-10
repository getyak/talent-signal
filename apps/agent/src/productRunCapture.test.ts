import { describe,expect,it } from "vitest";
import { captureProductStep,withProductRunCapture,type ProductRunSpan } from "./productRunCapture.js";

describe("request-local product execution capture",()=>{
  it("keeps concurrent roots separate and records actual nested tool results and failures",async()=>{
    const histories=await Promise.all(["web","ios"].map(async label=>{
      const spans:ProductRunSpan[]=[];
      await withProductRunCapture({async append(span){spans.push(span);}},()=>captureProductStep(label,"context",{label},async()=>{
        const result=await captureProductStep("search_contact_public","tool",{query:label},async()=>({sources:[label]}));
        await expect(captureProductStep("failed tool","tool",{},async()=>{throw new Error("unavailable");})).rejects.toThrow("unavailable");
        return result;
      }));
      return spans;
    }));
    for(const [index,spans] of histories.entries()){
      const root=spans.find(span=>span.parent_id===null)!;
      expect(spans).toHaveLength(3);expect(root.name).toBe(index===0?"web":"ios");
      expect(spans[0]!.parent_id).toBe(root.id);
      expect(spans[0]!.output.value).toEqual({sources:[root.name]});
      expect(spans[1]).toMatchObject({parent_id:root.id,status:"failed",error:"Operation failed"});
    }
  });
  it("omits original image bytes and provider error prose without changing the caller error",async()=>{
    const spans:ProductRunSpan[]=[];
    const marker="synthetic-private-image-bytes";
    const failure=new Error("Provider quoted sensitive source: "+marker);
    await expect(withProductRunCapture({async append(span){spans.push(span);}},()=>captureProductStep("image","llm",{
      images:[{data:Buffer.from(marker)},{data:new TextEncoder().encode(marker)}],
      serializedBuffer:{type:"Buffer",data:[...Buffer.from(marker)]},
      image:{data_base64:marker},content:[{source:{type:"base64",data:marker}}],url:"data:image/png;base64,"+marker
    },async()=>{throw failure;}))).rejects.toBe(failure);
    expect(spans).toHaveLength(1);
    expect(JSON.stringify(spans)).not.toContain(marker);
    expect(JSON.stringify(spans)).not.toContain(JSON.stringify([...Buffer.from(marker)]));
    expect((spans[0]!.input.value as {images:Array<{data:unknown}>}).images.every(image=>typeof image.data === "string")).toBe(true);
    expect(spans[0]).toMatchObject({status:"failed",error:"Operation failed"});
  });

});
