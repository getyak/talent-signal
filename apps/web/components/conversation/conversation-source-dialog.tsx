"use client";

import { X } from "@phosphor-icons/react";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ScreenshotContactTaskRequest,
  TextContactTaskRequest,
} from "@talent-signal/agent";

import {
  ContactAgentWorkspace,
  type ComposerMode,
  type SourceDraftSnapshot,
} from "../contact-agent/contact-agent-workspace";
import styles from "./conversation-source-dialog.module.css";

export type ConversationSourceDialogProps = {
  open: boolean;
  /** Files selected by conversation drop or paste, already validated. */
  initialFiles: readonly File[];
  initialObjective: string;
  initialResearch: boolean;
  initialText: string;
  initialInputMode: ComposerMode;
  initialTaskID: string | null;
  /** A preserved uncertain admission restored for an exact retry. */
  initialImageAttempt: ScreenshotContactTaskRequest | null;
  initialTextAttempt: TextContactTaskRequest | null;
  /** A transactional seed error raised by the host before opening. */
  initialError: string | null;
  /** Reports the live intake draft so the conversation host can retain it. */
  onDraftChange: (snapshot: SourceDraftSnapshot) => void;
  onRequestClose: () => void;
  /** Element focused before the dialog opened, restored on close. */
  returnFocusTo?: HTMLElement | null;
  /** Explicitly throws away the retained draft. */
  onDiscardDraft: () => void;
};

/**
 * Quiet source-intake dialog for the ordinary conversation home and Sessions.
 *
 * It never sends on open: dropped or pasted files are only staged inside the
 * existing ContactAgentWorkspace task composer, where the human still presses
 * "保存并整理". The selected images are saved as Sources, never as conversation
 * message attachments, so the copy says so plainly. The host retains the whole
 * draft — files, text, mode and any uncertain admission body — so closing and
 * reopening cannot lose work or turn an unknown outcome into a second source.
 */
export function ConversationSourceDialog({
  open,
  initialFiles,
  initialObjective,
  initialResearch,
  initialText,
  initialInputMode,
  initialTaskID,
  initialImageAttempt,
  initialTextAttempt,
  initialError,
  onDraftChange,
  onRequestClose,
  returnFocusTo,
  onDiscardDraft,
}: ConversationSourceDialogProps) {
  const [busy, setBusy] = useState(false);
  const [unresolved, setUnresolved] = useState(
    Boolean(initialImageAttempt || initialTextAttempt),
  );
  const [confirming, setConfirming] = useState(false);
  const admissionRef = useRef(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      setConfirming(false);
      return;
    }
    if (!open) wasOpen.current = false;
  }, [open]);

  const handleAdmissionChange = useCallback((submitting: boolean) => {
    // Synchronous: a close in the same tick as the admit click is blocked.
    admissionRef.current = submitting;
    setBusy(submitting);
  }, []);

  const handleDraftChange = useCallback(
    (snapshot: SourceDraftSnapshot) => {
      // The callback is stable; only mirror the fields the dialog reflects.
      if (admissionRef.current !== snapshot.submitting) {
        admissionRef.current = snapshot.submitting;
        setBusy(snapshot.submitting);
      }
      setUnresolved(snapshot.unresolved);
      onDraftChange(snapshot);
    },
    [onDraftChange],
  );

  const hasUnsavedDraft =
    initialFiles.length > 0 ||
    Boolean(initialImageAttempt) ||
    Boolean(initialTextAttempt) ||
    unresolved;

  function attemptClose() {
    if (admissionRef.current) return;
    if (hasUnsavedDraft) {
      setConfirming(true);
      return;
    }
    onRequestClose();
  }

  function keepDraftAndClose() {
    if (admissionRef.current) return;
    setConfirming(false);
    onRequestClose();
  }

  function discardDraftAndClose() {
    if (admissionRef.current) return;
    setConfirming(false);
    onDiscardDraft();
    onRequestClose();
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) attemptClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.backdrop} />
        <Dialog.Content
          className={styles.dialog}
          onEscapeKeyDown={(event) => {
            if (admissionRef.current) {
              event.preventDefault();
              return;
            }
            if (hasUnsavedDraft) {
              event.preventDefault();
              setConfirming(true);
            }
          }}
          onPointerDownOutside={(event) => {
            if (admissionRef.current || hasUnsavedDraft) event.preventDefault();
            if (hasUnsavedDraft && !admissionRef.current) setConfirming(true);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocusTo;
            if (target?.isConnected) {
              target.focus({ preventScroll: true });
            } else {
              document
                .getElementById("queued-conversation-composer")
                ?.focus({ preventScroll: true });
            }
          }}
        >
          {open ? (
            <>
              <header className={styles.header}>
                <div>
                  <Dialog.Title asChild>
                    <h2>保存并整理图片</h2>
                  </Dialog.Title>
                  <Dialog.Description asChild>
                    <p>
                      图片会保存为一条来源并整理，最长保留 30
                      天；不会作为对话消息发送。
                    </p>
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button aria-label="关闭来源整理" disabled={busy} type="button">
                    <X aria-hidden size={18} />
                  </button>
                </Dialog.Close>
              </header>

              {confirming ? (
                <div
                  aria-label="未保存的来源"
                  className={styles.confirm}
                  role="alertdialog"
                >
                  <p>
                    这次来源还没有保存。关闭后会保留草稿与未确认的提交，重新打开可继续；也可以现在放弃。
                  </p>
                  <div>
                    <button disabled={busy} onClick={keepDraftAndClose} type="button">
                      保留并关闭
                    </button>
                    <button disabled={busy} onClick={discardDraftAndClose} type="button">
                      放弃草稿
                    </button>
                  </div>
                </div>
              ) : null}

              <ContactAgentWorkspace
                embedded
                initialError={initialError}
                initialFiles={initialFiles}
                initialImageAttempt={initialImageAttempt}
                initialInputMode={initialInputMode}
                initialObjective={initialObjective}
                initialResearch={initialResearch}
                initialTaskID={initialTaskID ?? undefined}
                initialText={initialText}
                initialTextAttempt={initialTextAttempt}
                onAdmissionChange={handleAdmissionChange}
                onDraftChange={handleDraftChange}
                presentation="dialog"
              />
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
