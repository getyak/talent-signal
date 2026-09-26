/** Decode and re-encode only user-selected raster images; never retain original bytes. */
export async function prepareAvatarUpload(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  if (file.size > 8 * 1024 * 1024) throw new Error("图片不能超过 8 MB。");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("图片无法读取，请换一张 JPG、PNG 或 WebP 图片重试。"); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error("图片尺寸过大，请选择较小的图片。");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 192;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器无法处理图片，请换一张图片重试。");
    const edge = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, 192, 192);
    const result = canvas.toDataURL("image/webp", .84);
    if (result.length > 100_000) throw new Error("图片处理后仍然过大，请换一张较简单的图片。");
    return result;
  } finally { bitmap.close(); }
}
