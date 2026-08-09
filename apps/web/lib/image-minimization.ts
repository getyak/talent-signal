export type NormalizedImagePoint = {
  x: number;
  y: number;
};

export type NormalizedImageRedaction = {
  height: number;
  id: string;
  width: number;
  x: number;
  y: number;
};

export type PixelRedaction = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const MINIMUM_REDACTION_SIZE = 0.008;

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function normalizedImagePoint(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "height" | "left" | "top" | "width">,
): NormalizedImagePoint {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: clampUnit((clientX - bounds.left) / bounds.width),
    y: clampUnit((clientY - bounds.top) / bounds.height),
  };
}

export function createNormalizedRedaction(
  start: NormalizedImagePoint,
  end: NormalizedImagePoint,
  id: string,
): NormalizedImageRedaction | null {
  const x = clampUnit(Math.min(start.x, end.x));
  const y = clampUnit(Math.min(start.y, end.y));
  const width = clampUnit(Math.max(start.x, end.x)) - x;
  const height = clampUnit(Math.max(start.y, end.y)) - y;
  if (
    width < MINIMUM_REDACTION_SIZE ||
    height < MINIMUM_REDACTION_SIZE
  ) {
    return null;
  }
  return { height, id, width, x, y };
}

export function redactionInPreparedImage(
  redaction: NormalizedImageRedaction,
  imageWidth: number,
  imageHeight: number,
  cropTopPercent: number,
  cropBottomPercent: number,
): PixelRedaction | null {
  const cropTop = Math.round((imageHeight * cropTopPercent) / 100);
  const cropBottom = Math.round((imageHeight * cropBottomPercent) / 100);
  const sourceTop = redaction.y * imageHeight;
  const sourceBottom = (redaction.y + redaction.height) * imageHeight;
  const intersectionTop = Math.max(sourceTop, cropTop);
  const intersectionBottom = Math.min(sourceBottom, cropBottom);
  if (intersectionBottom <= intersectionTop) {
    return null;
  }

  const sourceLeft = redaction.x * imageWidth;
  const sourceRight = (redaction.x + redaction.width) * imageWidth;
  return {
    height: intersectionBottom - intersectionTop,
    width: Math.max(0, sourceRight - sourceLeft),
    x: sourceLeft,
    y: intersectionTop - cropTop,
  };
}
