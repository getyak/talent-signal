import assert from "node:assert/strict";
import test from "node:test";
import {
  cropPixels,
  estimateDataUrlBytes,
  isRedactionVisible,
  normalizeCrop,
  normalizeRedaction,
  redactionPixels,
} from "../load-unpacked/lib/image-review.js";

test("normalizes crop controls without allowing an empty image", () => {
  assert.deepEqual(
    normalizeCrop({ left: 70, right: 70, top: -5, bottom: 900 }),
    { left: 70, top: 0, right: 10, bottom: 80 },
  );
  assert.deepEqual(cropPixels(1_000, 500, {
    left: 10,
    right: 20,
    top: 10,
    bottom: 10,
  }), {
    sx: 100,
    sy: 50,
    width: 700,
    height: 400,
    crop: { left: 10, top: 10, right: 20, bottom: 10 },
  });
});

test("keeps redaction geometry reviewable after crop", () => {
  const redaction = normalizeRedaction({
    x: 25,
    y: 30,
    width: 20,
    height: 10,
  });
  const crop = { left: 10, right: 10, top: 20, bottom: 20 };
  assert.equal(isRedactionVisible(redaction, crop), true);
  assert.deepEqual(redactionPixels(redaction, crop, 800, 600), {
    x: 150,
    y: 100,
    width: 200,
    height: 100,
  });
});

test("recognizes redactions removed by crop and estimates payload size", () => {
  assert.equal(
    isRedactionVisible(
      { x: 0, y: 0, width: 5, height: 5 },
      { left: 10, top: 10, right: 0, bottom: 0 },
    ),
    false,
  );
  assert.equal(
    estimateDataUrlBytes("data:image/png;base64,QUJDRA=="),
    6,
  );
});
