"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { ConversationImageManifest } from "@talent-signal/contracts";

import { workspaceSessionFetch } from "../workspace-session-request";
import { loadConversationImages } from "@/lib/conversation-image-store";
import styles from "./queued-conversation.module.css";

type Props = {
  sessionId: string;
  messageId: string;
  /** Storage scope for local pending bytes; ignored for server history. */
  scope: string;
  images: readonly ConversationImageManifest[];
  /** Captured Session binding; the same mounted conversation identity. */
  binding: string;
  /** Pending outbox images live in IndexedDB until the server echoes them. */
  local: boolean;
  compact?: boolean;
};

function imageKey(images: readonly ConversationImageManifest[]): string {
  return images.map((image) => image.attachment_id).join("|");
}

/**
 * Inline conversation image strip.
 *
 * Bytes always arrive through the scoped proxy or the local durable store,
 * never through a bare `<img src>` pointing at a sensitive URL. Object URLs are
 * created per mounted strip and revoked when the strip unmounts or the account
 * binding changes. Clicking a thumbnail opens the original in a viewing dialog;
 * nothing is processed automatically. A failed read shows an explicit retry
 * instead of an indefinite loading placeholder.
 */
export function ConversationImageStrip(props: Props) {
  const [attempt, setAttempt] = useState(0);
  const identity = JSON.stringify([props.scope, props.sessionId, props.messageId, props.binding, props.local, imageKey(props.images), attempt]);
  return <LoadedConversationImageStrip {...props} key={identity} onRetry={() => setAttempt((value) => value + 1)} />;
}

function LoadedConversationImageStrip({
  sessionId,
  messageId,
  scope,
  images,
  binding,
  local,
  compact = false,
  onRetry,
}: Props & { onRetry: () => void }) {
  const [urls, setUrls] = useState<Array<string | null>>(() => images.map(() => null));
  const [failed, setFailed] = useState<boolean[]>(() => images.map(() => false));
  const [open, setOpen] = useState(false);
  const created = useRef<string[]>([]);
  const keys = imageKey(images);

  useEffect(() => {
    let cancelled = false;
    for (const url of created.current) URL.revokeObjectURL(url);
    created.current = [];
    const keep = (url: string) => created.current.push(url);
    const markFailed = (index: number) => setFailed((previous) => previous.map((value, position) => (position === index ? true : value)));
    void (async () => {
      if (local) {
        const stored = await loadConversationImages(scope, sessionId, messageId);
        if (cancelled) return;
        const ordered = [...stored].sort((a, b) => a.position - b.position);
        const next = images.map((manifest, index) => {
          const record = ordered[index];
          if (!record || record.attachment_id !== manifest.attachment_id) { markFailed(index); return null; }
          const url = URL.createObjectURL(record.blob);
          keep(url);
          return url;
        });
        if (!cancelled) setUrls(next);
        return;
      }
      for (let index = 0; index < images.length; index += 1) {
        try {
          const response = await workspaceSessionFetch(
            `/api/workspace-sessions/${encodeURIComponent(sessionId)}/conversation-images/${encodeURIComponent(messageId)}/${index}`,
            { cache: "no-store", headers: { "x-workspace-session": binding }, signal: AbortSignal.timeout(15_000) },
          );
          if (cancelled) return;
          if (!response.ok) { markFailed(index); continue; }
          const blob = await response.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          keep(url);
          setUrls((previous) => previous.map((value, position) => (position === index ? url : value)));
        } catch {
          if (!cancelled) markFailed(index);
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const url of created.current) URL.revokeObjectURL(url);
      created.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, messageId, scope, binding, local, keys]);

  if (images.length === 0) return null;
  const ready = urls.filter((url): url is string => Boolean(url)).length;
  const anyFailed = failed.some(Boolean);

  return (
    <div className={styles.images} data-compact={compact ? "true" : undefined}>
      <ul className={styles.imageList} aria-label={`消息中的 ${images.length} 张图片`}>
        {images.map((image, index) => (
          <li className={styles.imageItem} key={image.attachment_id}>
            {urls[index] ? (
              <button
                className={styles.imageButton}
                onClick={() => setOpen(true)}
                title={`查看原图 ${index + 1}`}
                type="button"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={image.file_name} src={urls[index]!} />
              </button>
            ) : (
              <span
                className={styles.imagePlaceholder}
                data-error={failed[index] ? "true" : undefined}
                role="status"
              >
                {failed[index] ? "图片暂时无法读取" : "正在读取图片…"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {anyFailed ? (
        <button className={styles.imageRetry} onClick={onRetry} type="button">
          重新读取图片
        </button>
      ) : null}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.imageBackdrop} />
          <Dialog.Content className={styles.imageDialog} aria-describedby={undefined}>
            <Dialog.Title className={styles.imageDialogTitle}>
              原图{ready > 0 ? "" : "（正在读取）"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="关闭原图" className={styles.imageClose} type="button">
                <X aria-hidden size={17} />
              </button>
            </Dialog.Close>
            {urls.map((url, index) =>
              url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={images[index]?.file_name ?? `原图 ${index + 1}`} key={images[index]?.attachment_id ?? index} src={url} />
              ) : null,
            )}
            {ready === 0 ? <p className={styles.imageDialogMessage}>原图暂时无法读取，请关闭后重试。</p> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
