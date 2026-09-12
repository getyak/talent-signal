import { z } from "zod";
import type { RemoteChatAnswerRequest } from "./chatAnswerProvider.js";
import type { HarnessTool } from "./claudeHarness.js";
import { screenshotImageViews } from "./screenshotImageViews.js";

/** No pixel cache survives a tool call. Every traversal rechecks its original. */
export function evidenceImageTools(request: RemoteChatAnswerRequest, imageInputEnabled: boolean,
  registerGuard: (id: string, guard: () => Promise<void>) => void = () => {}): HarnessTool[] {
  if (!imageInputEnabled || request.mode === "unscoped_conversation" || !request.readEvidenceImage ||
    !request.assertCurrent || !request.allowed_citation_ids.length) return [];
  const allowed = new Set(request.allowed_citation_ids);
  const read = request.readEvidenceImage;
  const current = request.assertCurrent;
  return [{ name: "read_evidence_source_image", alwaysLoad: true, readOnly: true,
    description: "Trace an allowed Memory evidence ID to its original screenshot. Omit tile_index to locate content with an overview and original-pixel tile map; then read a numbered tile to verify exact wording. Not every evidence source is an image. Returned pixels remain unconfirmed source evidence; cite the same evidence ID with cite_evidence. No new source or permission is created.",
    schema: z.strictObject({ evidence_id: z.string().uuid(), tile_index: z.number().int().min(0).optional() }),
    execute: async (input, signal) => {
      const id = input.evidence_id as string;
      if (!allowed.has(id)) return { content: [{ type: "text", text: "EVIDENCE_IMAGE_OUTSIDE_CURRENT_SCOPE" }], isError: true };
      let sourceCurrent: (() => Promise<void>) | undefined;
      const guarded = async <T>(operation: () => Promise<T>) => {
        signal.throwIfAborted(); await current(); await sourceCurrent?.();
        const result = await operation();
        signal.throwIfAborted(); await current(); await sourceCurrent?.(); return result;
      };
      return guarded(async () => {
        const source = await read(id, signal);
        if (source.evidence_id !== id) throw new Error("EVIDENCE_IMAGE_SCOPE_MISMATCH");
        sourceCurrent = source.assertCurrent;
        registerGuard(id, source.assertCurrent);
        const views = await screenshotImageViews([source.image], guarded, signal, [source.source_image_index]);
        const provenance = { evidence_id: id, task_id: source.task_id, source_resource_id: source.source_resource_id,
          source_image_index: source.source_image_index, source_hash: source.image.content_hash };
        if (input.tile_index !== undefined) {
          const result = await views.tool.execute({ source_image_index: source.source_image_index, tile_index: input.tile_index }, signal);
          return { ...result, content: [{ type: "text" as const, text: JSON.stringify(provenance) }, ...result.content] };
        }
        const overview = views.overviewImages[0]!;
        return { content: [
          { type: "text" as const, text: JSON.stringify({ ...provenance, screenshot_image_views: views.manifest }) },
          { type: "image" as const, mimeType: overview.media_type, data: overview.data_base64 },
        ] };
      });
    },
  }];
}
