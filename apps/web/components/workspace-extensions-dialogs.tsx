"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, X } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import styles from "./workspace-extensions.module.css";

/** Restrained dialog frame shared by every extension dialog. */
export function ExtensionDialog({
  children,
  dismissible = true,
  description,
  footer,
  onClose,
  title,
  width,
}: {
  children: ReactNode;
  dismissible?: boolean;
  description: string;
  footer: ReactNode;
  onClose: () => void;
  title: string;
  width?: "default" | "wide";
}) {
  return (
    <Dialog.Root
      onOpenChange={(next) => {
        if (!next && dismissible) onClose();
      }}
      open
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`${styles.dialog} ${width === "wide" ? styles.dialogWide : ""}`}
        >
          <header className={styles.dialogHeader}>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            {dismissible ? <Dialog.Close aria-label="关闭" className={styles.closeButton}>
              <X aria-hidden="true" size={16} />
            </Dialog.Close> : null}
          </header>
          {children}
          <footer className={styles.dialogFooter}>{footer}</footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  busy = false,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  busy?: boolean;
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  if (!open) return null;
  return (
    <ExtensionDialog
      dismissible={!busy}
      description={description}
      footer={
        <>
          <button className={styles.quiet} disabled={busy} onClick={onCancel} type="button">
            取消
          </button>
          <button className={styles.danger} disabled={busy} onClick={onConfirm} type="button">
            {busy ? "正在处理…" : confirmLabel}
          </button>
        </>
      }
      onClose={onCancel}
      title={title}
    >
      {null}
    </ExtensionDialog>
  );
}

export function CopyButton({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<"copied" | "error" | "idle">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("error");
    }
    window.setTimeout(() => setState("idle"), 2_500);
  }
  return (
    <div className={styles.copyArea}>
      <button className={styles.quiet} onClick={() => void copy()} type="button">
        {state === "copied" ? (
          <Check aria-hidden="true" size={14} />
        ) : (
          <Copy aria-hidden="true" size={14} />
        )}
        {state === "copied" ? "已复制" : label}
      </button>
      {state === "error" ? (
        <small role="alert">浏览器拒绝了剪贴板访问，请手动选择并复制上面的内容。</small>
      ) : null}
    </div>
  );
}
