/** Bounded image retention, independent of any mounted conversation. */
import {
  clearConversationImages,
  conversationImageStore,
  invalidateConversationImageStore,
  purgeExpiredConversationImages,
} from "./conversation-image-store";

let activeScope: string | undefined;

/** Account changes also remove foreign bytes when localStorage is unavailable. */
export function sweepConversationImageStore(scope?: string): void {
  if (scope && activeScope !== scope) {
    activeScope = scope;
    invalidateConversationImageStore();
  }
  void (async () => {
    try {
      await purgeExpiredConversationImages();
      const store = conversationImageStore();
      if (!store || !scope) return;
      for (const entry of await store.inventory()) {
        if (activeScope !== scope) return;
        if (!entry.key.startsWith(`${scope}:`)) await store.delete(entry.key);
      }
      // Do not prune live current-scope puts against localStorage: another
      // mounted chat/tab may still be committing its metadata. Expiry bounds
      // any crash orphan without racing that commit.
    } catch {
      /* Denied storage remains fail-closed at admission. */
    }
  })();
}

/** Invalidate in-flight puts and clear one scope/session (or everything). */
export function clearConversationImageStore(scope?: string, session?: string): void {
  invalidateConversationImageStore();
  if (!scope) activeScope = undefined;
  void clearConversationImages(scope, session);
}
