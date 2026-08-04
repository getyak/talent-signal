import { describe, expect, it } from "vitest";

import { digestValue, stableStringify } from "./hash.js";

describe("stable hashing", () => {
  it("produces one digest for semantically identical object key orders", () => {
    expect(digestValue({ b: 2, a: { y: 2, x: 1 } })).toBe(
      digestValue({ a: { x: 1, y: 2 }, b: 2 }),
    );
  });

  it("preserves array order because effect order may be meaningful", () => {
    expect(stableStringify({ values: ["a", "b"] })).not.toBe(
      stableStringify({ values: ["b", "a"] }),
    );
  });
});
