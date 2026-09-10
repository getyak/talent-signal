import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { screenshotImageViews, type ImageReadAuthority } from "./screenshotImageViews.js";

const signal = () => new AbortController().signal;
const direct: ImageReadAuthority = async operation => operation();
async function source(width = 30, height = 3000) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 3;
    data[offset] = y % 256; data[offset + 1] = x % 256; data[offset + 2] = 73;
  }
  const bytes = await sharp(data, {raw:{width,height,channels:3}}).png().toBuffer();
  return {media_type:"image/png" as const,byte_size:bytes.length,content_hash:createHash("sha256").update(bytes).digest("hex"),data_base64:bytes.toString("base64")};
}

describe("original screenshot views", () => {
  it.each([2,5,6,7,8])("keeps EXIF orientation %s coordinates tied to actual oriented pixels",async orientation=>{
    const original=await source(8,12);
    const bytes=await sharp(Buffer.from(original.data_base64,"base64")).withMetadata({orientation}).png().toBuffer();
    const oriented=await sharp(bytes).autoOrient().raw().toBuffer({resolveWithObject:true});
    const image={...original,byte_size:bytes.length,content_hash:createHash("sha256").update(bytes).digest("hex"),data_base64:bytes.toString("base64")};
    const views=await screenshotImageViews([image],direct,signal());
    expect([views.manifest[0]!.width,views.manifest[0]!.height]).toEqual([oriented.info.width,oriented.info.height]);
    const result=await views.tool.execute({source_image_index:0,region:{left:3,top:2,width:2,height:4}},signal());
    const actual=await sharp(Buffer.from(result.content.find(block=>block.type==="image")!.data,"base64")).raw().toBuffer();
    const rows=[];
    for(let y=2;y<6;y++)rows.push(oriented.data.subarray((y*oriented.info.width+3)*oriented.info.channels,(y*oriented.info.width+5)*oriented.info.channels));
    expect(actual.equals(Buffer.concat(rows))).toBe(true);
  });
  it("rejects an excessive raster pixel budget before deriving any view",async()=>{
    const bytes=await sharp({create:{width:7000,height:6000,channels:3,background:"white"}}).png().toBuffer();
    const image={media_type:"image/png" as const,byte_size:bytes.length,content_hash:createHash("sha256").update(bytes).digest("hex"),data_base64:bytes.toString("base64")};
    await expect(screenshotImageViews([image],direct,signal())).rejects.toThrow(/pixel limit/i);
  });
  it("admits an over-8k original through a bounded whole-image overview while keeping native tile pixels",async()=>{
    const original=await source(120,9000);
    const views=await screenshotImageViews([original],direct,signal());
    expect(views.manifest[0]!.height).toBe(9000);
    expect(views.manifest[0]!.source_hash).toBe(original.content_hash);
    expect(views.overviewImages[0]!.content_hash).not.toBe(original.content_hash);
    const overview=await sharp(Buffer.from(views.overviewImages[0]!.data_base64,"base64")).metadata();
    expect(overview.height).toBe(1568);expect(views.overviewImages[0]!.byte_size).toBeLessThanOrEqual(2_000_000);
    const result=await views.tool.execute({source_image_index:0,region:{left:7,top:8501,width:4,height:3}},signal());
    const image=result.content.find(block=>block.type==="image")!;
    const pixels=await sharp(Buffer.from(image.data,"base64")).raw().toBuffer();
    expect([...pixels.subarray(0,3)]).toEqual([8501%256,7,73]);
  });
  it("covers long screenshots with overlapping clear tiles and returns exact pixels with original provenance", async () => {
    const original = await source();
    const {manifest,tool} = await screenshotImageViews([original],direct,signal());
    expect(manifest[0]!.tile_count).toBe(3);
    const covered = new Set<number>();
    for (const tile of manifest[0]!.tiles) {
      for(let y=tile.top;y<tile.top+tile.height;y++) covered.add(y);
      const result = await tool.execute({source_image_index:0,tile_index:tile.tile_index},signal());
      const receipt = JSON.parse(result.content.filter(block=>block.type==="text")[0]!.text);
      expect(receipt.source_hash).toBe(original.content_hash);
      expect(receipt.source_image_index).toBe(0);
      const image = result.content.find(block=>block.type==="image")!;
      const {data,info} = await sharp(Buffer.from(image.data,"base64")).raw().toBuffer({resolveWithObject:true});
      expect(info.width).toBe(30);expect(info.height).toBe(tile.height);
      expect([...data.subarray(0,3)]).toEqual([tile.top%256,0,73]);
      expect([...data.subarray(data.length-3)]).toEqual([(tile.top+tile.height-1)%256,29,73]);
    }
    expect(covered.size).toBe(3000);
  });
  it("fails closed for invalid selections, coordinates, integrity and image format", async () => {
    const original=await source(20,30);
    const {tool}=await screenshotImageViews([original],direct,signal());
    for(const args of [{source_image_index:1,tile_index:0},{source_image_index:0,tile_index:1},
      {source_image_index:0},{source_image_index:0,tile_index:0,region:{left:0,top:0,width:1,height:1}},
      {source_image_index:0,region:{left:19,top:0,width:2,height:1}}]) {
      expect((await tool.execute(args,signal())).isError).toBe(true);
    }
    await expect(screenshotImageViews([{...original,content_hash:"0".repeat(64)}],direct,signal())).rejects.toThrow("INTEGRITY");
    await expect(screenshotImageViews([{...original,media_type:"image/jpeg"}],direct,signal())).rejects.toThrow("FORMAT");
  });
  it("rechecks authority after processing and does not return derived pixels after revocation", async () => {
    let revoked=false;
    const read: ImageReadAuthority=async operation=>{if(revoked)throw new Error("SOURCE_REVOKED");const result=await operation();if(revoked)throw new Error("SOURCE_REVOKED");return result;};
    const {tool}=await screenshotImageViews([await source()],read,signal());
    const pending=tool.execute({source_image_index:0,tile_index:0},signal());
    revoked=true;
    await expect(pending).rejects.toThrow("SOURCE_REVOKED");
    await expect(tool.execute({source_image_index:0,tile_index:0},signal())).rejects.toThrow("SOURCE_REVOKED");
  });
  it("returns a requested region without changing or inventing source pixels",async()=>{
    const {tool}=await screenshotImageViews([await source()],direct,signal());
    const result=await tool.execute({source_image_index:0,region:{left:7,top:1501,width:4,height:3}},signal());
    const image=result.content.find(block=>block.type==="image")!;
    const {data,info}=await sharp(Buffer.from(image.data,"base64")).raw().toBuffer({resolveWithObject:true});
    expect([info.width,info.height]).toEqual([4,3]);expect([...data.subarray(0,3)]).toEqual([1501%256,7,73]);
  });
});
