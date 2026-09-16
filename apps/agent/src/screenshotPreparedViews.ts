import { createHash } from "node:crypto";
import sharp, { type Sharp } from "sharp";
import type { ScreenshotPreprocessImage, ScreenshotPreprocessRegion } from "./screenshotPreprocess.js";

const MAX_PIXELS = 40_000_000;
const TILE_SIZE = 1_400;
const TILE_OVERLAP = 100;
const NATIVE_MAX_EDGE = 2_000;
const OVERVIEW_EDGE = 1_568;
const MAX_VIEW_BYTES = 4_000_000;
const MAX_OVERVIEW_BYTES = 2_000_000;

export interface PreparedView {
  /** Ephemeral, provider-facing bytes. Never persisted by a caller. */
  data_base64: string;
  media_type: "image/webp";
  byte_size: number;
  content_hash: string;
  /** EXIF-oriented original-pixel region this view covers, or the full image. */
  region: ScreenshotPreprocessRegion;
  transform: string;
}

export interface PreparedScreenshotViews {
  source_image_index: number;
  source_hash: string;
  /** EXIF-oriented original dimensions. */
  width: number;
  height: number;
  overview: PreparedView;
  tiles: PreparedView[];
  /** True when the overview alone is a faithful legible rendering. */
  native_clarity: boolean;
}

function starts(length: number): number[] {
  const result = [0];
  while (result.at(-1)! + TILE_SIZE < length) {
    result.push(Math.min(result.at(-1)! + TILE_SIZE - TILE_OVERLAP, length - TILE_SIZE));
  }
  return result;
}

function integrity(image: ScreenshotPreprocessImage): Buffer {
  if (image.data_base64.length > 13_400_000) throw new Error("SCREENSHOT_PREPROCESS_IMAGE_TOO_LARGE");
  const bytes = Buffer.from(image.data_base64, "base64");
  if (bytes.length !== image.byte_size || bytes.length > 10_000_000 ||
    bytes.toString("base64") !== image.data_base64 ||
    createHash("sha256").update(bytes).digest("hex") !== image.content_hash) {
    throw new Error("SCREENSHOT_PREPROCESS_IMAGE_INTEGRITY_MISMATCH");
  }
  return bytes;
}

/**
 * Render legible, EXIF-oriented WebP views for one original source image.
 * Ordinary screenshots keep native clarity in a single full-frame view. Long or
 * wide images additionally get overlapping bounded tiles so small text stays
 * readable. Every view is ephemeral: the caller owns no persistent copy and the
 * canonical original remains the source of truth.
 */
export async function prepareScreenshotViews(
  image: ScreenshotPreprocessImage,
  imageIndex: number,
): Promise<PreparedScreenshotViews> {
  const bytes = integrity(image);
  const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).metadata();
  if (!metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) > 60_000 ||
    (metadata.pages ?? 1) !== 1 || !["png", "jpeg", "webp"].includes(metadata.format ?? "") ||
    `image/${metadata.format}` !== image.media_type) {
    throw new Error("SCREENSHOT_PREPROCESS_IMAGE_FORMAT_INVALID");
  }
  const rotated = metadata.orientation !== undefined && metadata.orientation >= 5;
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;

  const render = async (transform: string, region: ScreenshotPreprocessRegion, pipeline: Sharp) => {
    const rendered = await pipeline.webp({ quality: 92 }).timeout({ seconds: 15 }).toBuffer();
    if (rendered.length > MAX_VIEW_BYTES) throw new Error("SCREENSHOT_PREPROCESS_VIEW_TOO_LARGE");
    return {
      data_base64: rendered.toString("base64"), media_type: "image/webp" as const,
      byte_size: rendered.length, content_hash: createHash("sha256").update(rendered).digest("hex"),
      region, transform,
    };
  };

  const full = { left: 0, top: 0, width, height };
  const longOrWide = Math.max(width, height) > NATIVE_MAX_EDGE;
  if (!longOrWide) {
    const overview = await render("auto-orient/native/webp92-v1", full,
      sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).autoOrient());
    if (overview.byte_size <= MAX_OVERVIEW_BYTES) {
      return { source_image_index: imageIndex, source_hash: image.content_hash, width, height,
        overview, tiles: [], native_clarity: true };
    }
  }

  const overview = await render("auto-orient/fit-1568/webp92-v1", full,
    sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).autoOrient()
      .resize({ width: OVERVIEW_EDGE, height: OVERVIEW_EDGE, fit: "inside", withoutEnlargement: true }));
  if (overview.byte_size > MAX_OVERVIEW_BYTES) throw new Error("SCREENSHOT_PREPROCESS_OVERVIEW_TOO_LARGE");

  const tiles: PreparedView[] = [];
  for (const top of starts(height)) {
    for (const left of starts(width)) {
      const region = { left, top, width: Math.min(TILE_SIZE, width - left), height: Math.min(TILE_SIZE, height - top) };
      tiles.push(await render("auto-orient/extract/webp92-v1", region,
        sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).autoOrient().extract(region)));
    }
  }
  if (tiles.length > 64) throw new Error("SCREENSHOT_PREPROCESS_TILE_LIMIT");
  return { source_image_index: imageIndex, source_hash: image.content_hash, width, height,
    overview, tiles, native_clarity: false };
}
