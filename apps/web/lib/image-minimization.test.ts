import { describe, expect, it } from "vitest";

import {
  createNormalizedRedaction,
  normalizedImagePoint,
  redactionInPreparedImage,
} from "./image-minimization";

describe("browser-local image minimization", () => {
  it("normalizes pointer coordinates and clamps them to the visible image", () => {
    expect(
      normalizedImagePoint(150, 250, {
        height: 200,
        left: 100,
        top: 200,
        width: 100,
      }),
    ).toEqual({ x: 0.5, y: 0.25 });
    expect(
      normalizedImagePoint(20, 900, {
        height: 200,
        left: 100,
        top: 200,
        width: 100,
      }),
    ).toEqual({ x: 0, y: 1 });
  });

  it("creates direction-independent redaction rectangles", () => {
    expect(
      createNormalizedRedaction(
        { x: 0.8, y: 0.7 },
        { x: 0.2, y: 0.3 },
        "redaction-1",
      ),
    ).toEqual({
      height: 0.39999999999999997,
      id: "redaction-1",
      width: 0.6000000000000001,
      x: 0.2,
      y: 0.3,
    });
  });

  it("rejects accidental clicks instead of hiding an unknown region", () => {
    expect(
      createNormalizedRedaction(
        { x: 0.4, y: 0.4 },
        { x: 0.402, y: 0.402 },
        "redaction-1",
      ),
    ).toBeNull();
  });

  it("projects only the crop-intersecting portion into transmitted pixels", () => {
    expect(
      redactionInPreparedImage(
        {
          height: 0.4,
          id: "redaction-1",
          width: 0.5,
          x: 0.25,
          y: 0.1,
        },
        1_000,
        2_000,
        20,
        80,
      ),
    ).toEqual({
      height: 600,
      width: 500,
      x: 250,
      y: 0,
    });
  });

  it("drops redactions that sit entirely outside the retained crop", () => {
    expect(
      redactionInPreparedImage(
        {
          height: 0.1,
          id: "redaction-1",
          width: 0.5,
          x: 0.25,
          y: 0.85,
        },
        1_000,
        2_000,
        20,
        80,
      ),
    ).toBeNull();
  });
});
