"use client";

import type { ChatMediaAsset } from "@talent-signal/contracts";
import {
  ArrowClockwise,
  Check,
  CircleNotch,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Image from "next/image";

import type { RelationshipChatMediaDraft } from "./use-relationship-agent-controller";

function contentUrl(mediaId: string) {
  return `/api/local-integration/chat/media/${mediaId}`;
}

export function RelationshipChatMediaDraftTray({
  drafts,
  onRemove,
  onRetry,
}: {
  drafts: RelationshipChatMediaDraft[];
  onRemove: (clientId: string) => void;
  onRetry: (clientId: string) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <div
      aria-label={`${drafts.length} selected ${drafts.length === 1 ? "image" : "images"}`}
      className="context-chat-media-drafts"
    >
      <div className="context-chat-media-drafts__heading">
        <span>
          {drafts.length} {drafts.length === 1 ? "image" : "images"}
        </span>
        <small>Task media · not evidence</small>
      </div>
      <ul>
        {drafts.map((draft) => (
          <li data-status={draft.status} key={draft.clientId}>
            <div className="context-chat-media-drafts__preview">
              <Image
                alt=""
                fill
                sizes="72px"
                src={draft.previewUrl}
                unoptimized
              />
              <span aria-hidden="true">
                {draft.status === "uploading" || draft.status === "removing" ? (
                  <CircleNotch className="spin" size={17} />
                ) : draft.status === "ready" ? (
                  <Check size={16} weight="bold" />
                ) : (
                  <WarningCircle size={17} weight="fill" />
                )}
              </span>
            </div>
            <p>
              <strong>{draft.file.name}</strong>
              <small>
                {draft.status === "uploading"
                  ? "Uploading…"
                  : draft.status === "removing"
                    ? "Removing…"
                    : draft.status === "ready"
                      ? "Stored"
                      : draft.error ?? "Upload failed"}
              </small>
            </p>
            <div>
              {draft.status === "failed" ? (
                <button
                  aria-label={`Retry ${draft.file.name}`}
                  onClick={() => onRetry(draft.clientId)}
                  title="Retry upload"
                  type="button"
                >
                  <ArrowClockwise aria-hidden="true" size={15} />
                </button>
              ) : null}
              <button
                aria-label={`Remove ${draft.file.name}`}
                disabled={draft.status === "uploading" || draft.status === "removing"}
                onClick={() => onRemove(draft.clientId)}
                title="Remove image"
                type="button"
              >
                <X aria-hidden="true" size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RelationshipChatMediaAlbum({
  media,
}: {
  media: ChatMediaAsset[];
}) {
  if (media.length === 0) return null;
  const visible = media.slice(0, 4);
  return (
    <div
      aria-label={`${media.length}-image album`}
      className="context-chat-media-album"
      data-count={Math.min(media.length, 4)}
    >
      {visible.map((item, index) => (
        <a
          aria-label={`Open image ${index + 1} of ${media.length}: ${item.file_name}`}
          href={contentUrl(item.id)}
          key={item.id}
          rel="noreferrer"
          target="_blank"
        >
          <Image
            alt={item.file_name}
            fill
            sizes={media.length === 1 ? "280px" : "140px"}
            src={contentUrl(item.id)}
            unoptimized
          />
          {index === 3 && media.length > 4 ? (
            <span aria-hidden="true">+{media.length - 4}</span>
          ) : null}
        </a>
      ))}
    </div>
  );
}
