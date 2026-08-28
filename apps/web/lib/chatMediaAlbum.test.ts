import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const album = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-chat-media.tsx",
  ),
  "utf8",
);
const controller = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/use-relationship-agent-controller.ts",
  ),
  "utf8",
);
const panel = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-agent-panel.tsx",
  ),
  "utf8",
);

describe("relationship Chat media album contract", () => {
  it("keeps album count, file names, and per-image inspection available to assistive tech", () => {
    expect(album).toContain('aria-label={`${media.length}-image album`}');
    expect(album).toContain("Open image ${index + 1} of ${media.length}");
    expect(album).toContain("alt={item.file_name}");
    expect(album).toContain('target="_blank"');
  });

  it("shows upload, retry, removal, and non-evidence states without color-only meaning", () => {
    expect(album).toContain("Uploading…");
    expect(album).toContain("Upload failed");
    expect(album).toContain("Retry upload");
    expect(album).toContain("Remove image");
    expect(album).toContain("Task media · not evidence");
  });

  it("bounds selection and blocks Ask until every selected image is ready", () => {
    expect(controller).toContain("const CHAT_MEDIA_MAX_ITEMS = 10");
    expect(controller).toContain("const CHAT_MEDIA_MAX_BYTES = 8 * 1024 * 1024");
    expect(panel).toContain('draft.status !== "ready"');
    expect(panel).toContain("multiple");
    expect(controller).toContain("mediaSignature !== mediaSignature");
  });
});
