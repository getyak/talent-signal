import { describe, expect, it } from "vitest";

import {
  ACCEPTED_IMAGE_TYPES,
  AdmissionGuard,
  MAX_ATTACHMENT_BYTES,
  SelectionGate,
  dataTransferHasFileEntries,
  imageFilesFromClipboard,
  reuseOrCreateAttempt,
  targetsTextEntry,
  validateAttachmentBatch,
} from "./capture-intake";

type Sized = { type: string; size: number };

function fake(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("attachment batch validation", () => {
  it("accepts the supported image types within every bound", () => {
    const incoming = [
      { type: "image/png", size: 1_000 },
      { type: "image/jpeg", size: 2_000 },
      { type: "image/webp", size: 3_000 },
    ];
    expect(validateAttachmentBatch([], incoming)).toEqual({
      ok: true,
      accepted: incoming,
    });
  });

  it("refuses unsupported, empty and oversize files as one batch", () => {
    expect(
      validateAttachmentBatch([], [{ type: "image/gif", size: 1_000 }]),
    ).toMatchObject({ ok: false, accepted: [] });
    expect(
      validateAttachmentBatch([], [{ type: "image/png", size: 0 }]),
    ).toMatchObject({ ok: false, accepted: [] });
    expect(
      validateAttachmentBatch([], [
        { type: "image/png", size: MAX_ATTACHMENT_BYTES + 1 },
      ]),
    ).toMatchObject({ ok: false, accepted: [] });
  });

  it("keeps prior attachments intact when part of a later batch is invalid", () => {
    const existing: Sized[] = [{ type: "image/png", size: 5_000 }];
    const result = validateAttachmentBatch(existing, [
      { type: "image/jpeg", size: 1_000 },
      { type: "application/pdf", size: 1_000 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.accepted).toEqual([]);
    // The caller keeps the original attachments because the batch is refused.
    expect(existing).toHaveLength(1);
  });

  it("caps the count and the combined byte size", () => {
    const ten = Array.from({ length: 10 }, () => ({
      type: "image/png",
      size: 1_000,
    }));
    expect(validateAttachmentBatch(ten, [{ type: "image/png", size: 1 }])).toMatchObject(
      { ok: false },
    );
    expect(
      validateAttachmentBatch(
        [{ type: "image/png", size: 25_000_000 }],
        [{ type: "image/jpeg", size: 6_000_000 }],
      ),
    ).toMatchObject({ ok: false });
  });

  it("exposes exactly the supported media types", () => {
    expect([...ACCEPTED_IMAGE_TYPES]).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });
});

describe("scoped paste routing", () => {
  it("does not hijack text entry targets", () => {
    expect(targetsTextEntry({ tagName: "textarea" })).toBe(true);
    expect(targetsTextEntry({ tagName: "INPUT" })).toBe(true);
    expect(targetsTextEntry({ isContentEditable: true })).toBe(true);
    expect(targetsTextEntry({ tagName: "SELECT" })).toBe(true);
  });

  it("allows routing from non-editable surfaces and ignores empty targets", () => {
    expect(targetsTextEntry({ tagName: "DIV" })).toBe(false);
    expect(targetsTextEntry({})).toBe(false);
    expect(targetsTextEntry(null)).toBe(false);
    expect(targetsTextEntry(undefined)).toBe(false);
  });

  it("takes only real image clipboard entries", () => {
    const png = fake("a.png", "image/png", 4);
    const jpeg = fake("b.jpg", "image/jpeg", 4);
    const files = imageFilesFromClipboard([
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => png },
      { kind: "file", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/jpeg", getAsFile: () => jpeg },
      { kind: "file", type: "image/webp", getAsFile: () => null },
    ]);
    expect(files).toEqual([png, jpeg]);
  });

  it("recognizes file entries so a directory-only drop can be refused", () => {
    expect(dataTransferHasFileEntries([{ kind: "file" }])).toBe(true);
    expect(dataTransferHasFileEntries([{ kind: "string" }])).toBe(false);
    expect(dataTransferHasFileEntries([])).toBe(false);
    expect(dataTransferHasFileEntries(undefined)).toBe(false);
  });
});

describe("admission and idempotency gates", () => {
  it("admits only one of two synchronous activations", () => {
    const guard = new AdmissionGuard();
    expect(guard.tryEnter()).toBe(true);
    expect(guard.pending).toBe(true);
    expect(guard.tryEnter()).toBe(false);
    guard.leave();
    expect(guard.pending).toBe(false);
    expect(guard.tryEnter()).toBe(true);
  });

  it("reuses the same attempt object across an unknown failure retry", () => {
    let builds = 0;
    const build = () => {
      builds += 1;
      return { idempotency_key: `key-${builds}` };
    };
    const first = reuseOrCreateAttempt(null, build);
    const retry = reuseOrCreateAttempt(first, build);
    expect(retry).toBe(first);
    expect(retry.idempotency_key).toBe("key-1");
    expect(builds).toBe(1);
  });

  it("ignores a late response once another selection begins", () => {
    const gate = new SelectionGate();
    const first = gate.begin();
    expect(gate.isCurrent(first)).toBe(true);
    gate.cancel();
    expect(gate.isCurrent(first)).toBe(false);
    const second = gate.begin();
    expect(gate.isCurrent(second)).toBe(true);
    expect(gate.isCurrent(first)).toBe(false);
  });
});
