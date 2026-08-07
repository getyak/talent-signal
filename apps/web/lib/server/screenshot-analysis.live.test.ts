import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { describe, expect, it } from "vitest";

import type { ScreenshotPlatform } from "../screenshot-capture";
import { analyzeScreenshot } from "./screenshot-analysis";

const live = process.env.TALENT_SIGNAL_RUN_LIVE_AI === "true";
const cases: Array<{ file: string; platform: ScreenshotPlatform }> = [
  { file: "wechat-synthetic.webp", platform: "wechat" },
  { file: "whatsapp-synthetic.webp", platform: "whatsapp" },
  { file: "line-synthetic.webp", platform: "line" },
  { file: "boss-synthetic.webp", platform: "boss_zhipin" },
  { file: "xiaohongshu-synthetic.webp", platform: "xiaohongshu" },
];

describe.runIf(live)("live synthetic screenshot analysis", () => {
  for (const item of cases) {
    it(
      `analyzes ${item.file} without a production answer fixture`,
      async () => {
        const imageUrl = new URL(
          `../../public/marketing/signal-journey/${item.file}`,
          import.meta.url,
        );
        const bytes = new Uint8Array(await readFile(imageUrl));
        const sourceSha256 = createHash("sha256")
          .update(bytes)
          .digest("hex");
        const result = await analyzeScreenshot({
          bytes,
          mimeType: "image/webp",
          contactName: `Synthetic Candidate · ${item.platform}`,
          assignmentLabel: "Synthetic executive-search evaluation",
          screenshotOwner: "candidate",
          sourceSha256,
        });

        expect(result.meta.provider).toBe("OpenRouter");
        expect(result.meta.request_id).toBeTruthy();
        expect(result.meta.source_sha256).toBe(sourceSha256);
        expect(result.meta.raw_image_stored_by_talent_signal).toBe(false);
        expect([item.platform, "unknown"]).toContain(result.draft.platform);
        expect(result.draft.messages.length).toBeGreaterThan(0);
        for (const assertion of result.draft.assertions) {
          const message = result.draft.messages.find(
            (candidate) =>
              candidate.source_message_id === assertion.evidence_message_id,
          );
          expect(message?.text).toContain(assertion.evidence_quote);
          if (assertion.status === "proposed") {
            expect(message?.speaker).toBe("candidate");
          }
        }

        console.log(
          "LIVE_SCREENSHOT_RESULT",
          JSON.stringify({
            file: basename(item.file),
            platform: result.draft.platform,
            provider: result.meta.provider,
            model: result.meta.model,
            request_id: result.meta.request_id,
            source_sha256: result.meta.source_sha256,
            disposition: result.draft.disposition,
            captured_at: result.draft.captured_at,
            messages: result.draft.messages.length,
            assertions: result.draft.assertions,
            action: result.draft.action,
            transcription_notes: result.draft.transcription_notes,
          }),
        );
      },
      90_000,
    );
  }
});
