export type AvatarCrop = { zoom: number; x: number; y: number };
export const centeredAvatarCrop: AvatarCrop = { zoom: 1, x: .5, y: .5 };
export const avatarImageSize = 192;

const clamp = (value: number, min: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

/** Source coordinates stay inside the decoded image, including portrait/landscape edges. */
export function avatarCropBounds(width: number, height: number, crop: AvatarCrop) {
  const edge = Math.min(width, height) / clamp(crop.zoom, 1, 3);
  return { x: (width - edge) * clamp(crop.x, 0, 1), y: (height - edge) * clamp(crop.y, 0, 1), edge };
}

/** The caller owns this bitmap and must close it on replacement, cancellation and unmount. */
export async function decodeAvatarUpload(file: File): Promise<ImageBitmap> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  if (!file.size) throw new Error("这张图片是空文件，请重新选择。");
  if (file.size > 8 * 1024 * 1024) throw new Error("图片不能超过 8 MB。");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("图片无法读取，请换一张 JPG、PNG 或 WebP 图片。"); }
  if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("图片尺寸过大，请选择较小的图片。");
  }
  return bitmap;
}

export function drawAvatarCrop(canvas: HTMLCanvasElement, bitmap: ImageBitmap, crop: AvatarCrop) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器无法处理图片，请换一张图片重试。");
  const { x, y, edge } = avatarCropBounds(bitmap.width, bitmap.height, crop);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, x, y, edge, edge, 0, 0, canvas.width, canvas.height);
}

/** Re-encoding strips original metadata; only this bounded thumbnail can be saved. */
export function encodeAvatarCrop(bitmap: ImageBitmap, crop = centeredAvatarCrop): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = avatarImageSize;
  drawAvatarCrop(canvas, bitmap, crop);
  const result = canvas.toDataURL("image/webp", .84);
  if (!/^data:image\/(webp|png|jpeg);base64,/u.test(result) || result.length > 100_000) {
    throw new Error("图片处理后仍然过大，请换一张较简单的图片。");
  }
  return result;
}

export async function prepareAvatarUpload(file: File): Promise<string> {
  const bitmap = await decodeAvatarUpload(file);
  try { return encodeAvatarCrop(bitmap); } finally { bitmap.close(); }
}
