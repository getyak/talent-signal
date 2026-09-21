// @vitest-environment happy-dom
//
// Transactional batch rules for the conversation source host. The host is the
// single validator: a new drop is checked against the retained set as one batch,
// the retained files survive a refusal, and two visually identical files are
// still two distinct objects unless the count/byte/MIME guard says otherwise.

import { describe, expect, it } from "vitest";

import {
  EMPTY_SOURCE_DRAFT,
  appendValidatedFiles,
  sameSourceDraft,
} from "./conversation-source-draft";

function image(
  name: string,
  size = 1_000,
  type = "image/png",
  modified = 1,
): File {
  return new File([new Uint8Array(size)], name, {
    type,
    lastModified: modified,
  });
}

const ten = Array.from({ length: 10 }, (_, index) =>
  image(`retained-${index}.png`),
);

describe("appendValidatedFiles", () => {
  it("accepts a new batch up to the shared ten-file limit", () => {
    const nine = ten.slice(0, 9);
    const incoming = image("new.png");
    const result = appendValidatedFiles(nine, [incoming]);
    expect(result.error).toBeNull();
    expect(result.files).toHaveLength(10);
    expect(result.files.at(-1)).toBe(incoming);
    expect(result.files.slice(0, 9)).toEqual(nine);
  });

  it("refuses the eleventh file but never drops the retained ten", () => {
    const incoming = image("new.png");
    const result = appendValidatedFiles(ten, [incoming]);
    expect(result.error).toContain("10");
    expect(result.files).toEqual(ten);
    expect(result.files).toHaveLength(10);
  });

  it("refuses an over-count batch without losing the retained files", () => {
    const result = appendValidatedFiles(ten, [
      image("a.png"),
      image("b.png"),
    ]);
    expect(result.error).not.toBeNull();
    expect(result.files).toEqual(ten);
    expect(result.files).toHaveLength(10);
  });

  it("refuses a batch that pushes the total over 30 MB", () => {
    const retained = [
      image("large-a.png", 14_000_000),
      image("large-b.png", 14_000_000),
    ];
    const result = appendValidatedFiles(retained, [
      image("too-much.png", 3_000_000),
    ]);
    expect(result.error).toContain("30 MB");
    expect(result.files).toEqual(retained);
  });

  it("refuses the whole batch when one file has an unsupported type", () => {
    const retained = [image("keep.png")];
    const result = appendValidatedFiles(retained, [
      image("ok.png"),
      image("bad.gif", 1_000, "image/gif"),
    ]);
    expect(result.error).not.toBeNull();
    expect(result.files).toEqual(retained);
  });

  it("preserves two distinct files that share name, size and mtime", () => {
    const first = image("same.png", 2_000, "image/png", 7);
    const second = image("same.png", 2_000, "image/png", 7);
    const result = appendValidatedFiles([first], [second]);
    expect(result.error).toBeNull();
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toBe(first);
    expect(result.files[1]).toBe(second);
  });

  it("returns the retained files unchanged for an empty batch", () => {
    const result = appendValidatedFiles(ten, []);
    expect(result.error).toBeNull();
    expect(result.files).toEqual(ten);
  });
});

describe("sameSourceDraft", () => {
  it("treats equal-valued drafts as the same snapshot", () => {
    expect(sameSourceDraft(EMPTY_SOURCE_DRAFT, { ...EMPTY_SOURCE_DRAFT })).toBe(
      true,
    );
    expect(
      sameSourceDraft(EMPTY_SOURCE_DRAFT, {
        ...EMPTY_SOURCE_DRAFT,
        files: [image("a.png")],
      }),
    ).toBe(false);
  });
});
