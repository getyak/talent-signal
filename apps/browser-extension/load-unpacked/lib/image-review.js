export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

export function normalizeCrop(crop) {
  const left = clamp(crop?.left, 0, 80);
  const top = clamp(crop?.top, 0, 80);
  const right = clamp(crop?.right, 0, 80 - left);
  const bottom = clamp(crop?.bottom, 0, 80 - top);

  return { left, top, right, bottom };
}

export function normalizeRedaction(redaction) {
  const x = clamp(redaction?.x, 0, 99);
  const y = clamp(redaction?.y, 0, 99);
  const width = clamp(redaction?.width, 1, 100 - x);
  const height = clamp(redaction?.height, 1, 100 - y);

  return { x, y, width, height };
}

export function cropPixels(imageWidth, imageHeight, crop) {
  const normalized = normalizeCrop(crop);
  const sx = Math.round((normalized.left / 100) * imageWidth);
  const sy = Math.round((normalized.top / 100) * imageHeight);
  const width = Math.max(
    1,
    Math.round(
      imageWidth * (1 - (normalized.left + normalized.right) / 100),
    ),
  );
  const height = Math.max(
    1,
    Math.round(
      imageHeight * (1 - (normalized.top + normalized.bottom) / 100),
    ),
  );

  return { sx, sy, width, height, crop: normalized };
}

export function redactionPixels(redaction, crop, outputWidth, outputHeight) {
  const item = normalizeRedaction(redaction);
  const normalizedCrop = normalizeCrop(crop);
  const visibleWidth = 100 - normalizedCrop.left - normalizedCrop.right;
  const visibleHeight = 100 - normalizedCrop.top - normalizedCrop.bottom;
  const xWithinCrop = (item.x - normalizedCrop.left) / visibleWidth;
  const yWithinCrop = (item.y - normalizedCrop.top) / visibleHeight;

  return {
    x: Math.round(xWithinCrop * outputWidth),
    y: Math.round(yWithinCrop * outputHeight),
    width: Math.round((item.width / visibleWidth) * outputWidth),
    height: Math.round((item.height / visibleHeight) * outputHeight),
  };
}

export function isRedactionVisible(redaction, crop) {
  const item = normalizeRedaction(redaction);
  const normalizedCrop = normalizeCrop(crop);
  const cropRight = 100 - normalizedCrop.right;
  const cropBottom = 100 - normalizedCrop.bottom;

  return (
    item.x < cropRight &&
    item.y < cropBottom &&
    item.x + item.width > normalizedCrop.left &&
    item.y + item.height > normalizedCrop.top
  );
}

export function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string") {
    return 0;
  }

  const encoded = dataUrl.split(",", 2)[1] ?? "";
  return Math.floor((encoded.length * 3) / 4);
}
