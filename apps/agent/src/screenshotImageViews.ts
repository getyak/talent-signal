import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { HarnessTool } from "./claudeHarness.js";
import type { ScreenshotContactTaskRequest } from "./contactIntakeSchemas.js";

const MAX_PIXELS = 40_000_000;
const TILE_SIZE = 1_400;
const TILE_OVERLAP = 100;
const MAX_OUTPUT_BYTES = 4_000_000;
const MAX_OVERVIEW_BYTES = 2_000_000;
const Region = z.strictObject({ left: z.number().int().min(0), top: z.number().int().min(0),
  width: z.number().int().min(1).max(TILE_SIZE), height: z.number().int().min(1).max(TILE_SIZE) });
type Rect = z.infer<typeof Region>;
type Image = ScreenshotContactTaskRequest["image"];
export type ImageReadAuthority = <T>(operation: () => Promise<T>, signal: AbortSignal) => Promise<T>;

function starts(length: number): number[] {
  const result = [0];
  while (result.at(-1)! + TILE_SIZE < length) result.push(Math.min(result.at(-1)! + TILE_SIZE - TILE_OVERLAP, length - TILE_SIZE));
  return result;
}

/** Derived pixels live only in the current SDK run; originals remain canonical. */
export async function screenshotImageViews(images: readonly Image[], read: ImageReadAuthority, signal: AbortSignal) {
  if(images.length>10 || images.reduce((total,image)=>total+image.byte_size,0)>30_000_000)throw new Error("CONTACT_IMAGE_VIEW_LIMIT");
  const sources = await read(async () => {
    const result = [];
    for (const [index, image] of images.entries()) {
      signal.throwIfAborted();
      if(image.data_base64.length>13_400_000)throw new Error("CONTACT_IMAGE_INTEGRITY_MISMATCH");
      const bytes = Buffer.from(image.data_base64, "base64");
      if (bytes.length !== image.byte_size || bytes.length > 10_000_000 ||
        bytes.toString("base64") !== image.data_base64 || createHash("sha256").update(bytes).digest("hex") !== image.content_hash) {
        throw new Error("CONTACT_IMAGE_INTEGRITY_MISMATCH");
      }
      // Buffer input only: model-supplied paths/URLs can never reach libvips.
      const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).metadata();
      if (!metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) > 60_000 || (metadata.pages ?? 1) !== 1 ||
        !["png", "jpeg", "webp"].includes(metadata.format ?? "") || `image/${metadata.format}` !== image.media_type) {
        throw new Error("CONTACT_IMAGE_FORMAT_INVALID");
      }
      const rotated = metadata.orientation !== undefined && metadata.orientation >= 5;
      const width = rotated ? metadata.height : metadata.width;
      const height = rotated ? metadata.width : metadata.height;
      // The first model request must fit provider dimensions before any tile
      // tool can run. Preserve the canonical bytes only in the source closure.
      let overview=image;
      let overviewWidth=width,overviewHeight=height;
      if (Math.max(width,height)>2_000 || bytes.length>MAX_OVERVIEW_BYTES) {
        const rendered=await sharp(bytes,{limitInputPixels:MAX_PIXELS,failOn:"warning"})
          .autoOrient().resize({width:1_568,height:1_568,fit:"inside",withoutEnlargement:true})
          .jpeg({quality:85}).timeout({seconds:10}).toBuffer({resolveWithObject:true});
        if(rendered.data.length>MAX_OVERVIEW_BYTES)throw new Error("CONTACT_IMAGE_OVERVIEW_TOO_LARGE");
        overviewWidth=rendered.info.width;overviewHeight=rendered.info.height;
        overview={media_type:"image/jpeg",byte_size:rendered.data.length,
          content_hash:createHash("sha256").update(rendered.data).digest("hex"),data_base64:rendered.data.toString("base64")};
      }
      const tiles: Rect[] = [];
      for (const top of starts(height)) for (const left of starts(width)) {
        tiles.push({ left, top, width: Math.min(TILE_SIZE, width - left), height: Math.min(TILE_SIZE, height - top) });
      }
      result.push({ index, image, bytes, width, height, tiles, overview, overviewWidth, overviewHeight });
    }
    return result;
  }, signal);
  const manifest = sources.map(({ index, image, width, height, tiles, overview, overviewWidth, overviewHeight }) => ({
    source_image_index: index, source_hash: image.content_hash, width, height,
    coordinate_space: "EXIF-oriented original pixels", tile_count: tiles.length,
    overview: {content_hash:overview.content_hash,width:overviewWidth,height:overviewHeight,
      transform:overview===image?"original":"auto-orient/fit-1568/jpeg85-v1"},
    tiles: tiles.map((region, tile_index) => ({ tile_index, ...region })),
  }));
  const schema = z.strictObject({ source_image_index: z.number().int().min(0).max(9),
    tile_index: z.number().int().min(0).optional(), region: Region.optional() });
  const tool: HarnessTool = {
    name: "inspect_screenshot_region", readOnly: true, alwaysLoad: true, schema,
    description: "View actual original-image pixels at readable resolution. Whole-image overviews are already in context; long/large overviews are scaled and must not be used to guess small text. Inspect the numbered clear overlapping tiles from screenshot_image_views; then request any bounded region to verify names, speakers, quotes or small text. Supply exactly one tile_index or region and the original source_image_index. Coordinates refer to EXIF-oriented original pixels, not the overview. A tile is a view of the SAME original source, never a new independent citation or confirmed fact.",
    execute: async (input, executionSignal) => read(async () => {
      executionSignal.throwIfAborted();
      const args = schema.parse(input);
      const source = sources[args.source_image_index];
      const fail = (error: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error,
        instruction:"No pixels were returned. Retry with source_image_index and exactly ONE tile_index OR region. If tile_index is supplied, remove region entirely. Use the tile map and original pixel dimensions from screenshot_image_views; do not guess coordinates or infer image contents from a failed read.",
        ...(source?{width:source.width,height:source.height,tile_indices:source.tiles.map((_,index)=>index)}:{available_image_indices:sources.map(source=>source.index)}),
      }) }], isError: true });
      if (!source || (args.tile_index === undefined) === (args.region === undefined)) return fail("CONTACT_IMAGE_VIEW_SELECTION_INVALID");
      const region = args.region ?? source.tiles[args.tile_index!];
      if (!region || region.left + region.width > source.width || region.top + region.height > source.height) return fail("CONTACT_IMAGE_REGION_OUT_OF_BOUNDS");
      // Sharp extract uses pixel coordinates; autoOrient before extract keeps
      // the source dimensions/coordinate receipt consistent for phone photos.
      const pixels = await sharp(source.bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" })
        .autoOrient().extract(region).png().timeout({ seconds: 10 }).toBuffer();
      executionSignal.throwIfAborted();
      if (pixels.length > MAX_OUTPUT_BYTES) return fail("CONTACT_IMAGE_VIEW_TOO_LARGE");
      return { content: [
        { type: "text" as const, text: JSON.stringify({ source_image_index: source.index, source_hash: source.image.content_hash,
          coordinate_space: "EXIF-oriented original pixels", region, transform: "auto-orient/extract/png-v1",
          view_hash: createHash("sha256").update(pixels).digest("hex"), byte_size: pixels.length,
          citation_instruction: "Cite the original image index and its visible exact excerpt. This view does not create new evidence." }) },
        { type: "image" as const, mimeType: "image/png" as const, data: pixels.toString("base64") },
      ] };
    }, executionSignal),
  };
  return { manifest, tool, overviewImages:sources.map(source=>source.overview) };
}
