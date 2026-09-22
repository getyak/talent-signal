import type { Pool } from "pg";

import { readConversationMessageImage } from "./conversationMessageImages.js";
import type { MemoryRegenerationImageLoader } from "./memoryReviewStage.js";

/**
 * Host-owned governed loader for regeneration. It reads the admitted original
 * image under current authentication and Session/queue expiry checks; the
 * Memory regeneration path never reaches a raw unguarded loader.
 */
export function createMemoryRegenerationImageLoader(
  pool: Pool,
): MemoryRegenerationImageLoader {
  return async ({ auth, sessionId, messageId, imageIndex }) => {
    const image = await readConversationMessageImage(
      pool,
      auth,
      sessionId,
      messageId,
      imageIndex,
    );
    return image
      ? { media_type: image.media_type, content: image.content }
      : null;
  };
}
