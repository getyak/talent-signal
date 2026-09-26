"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Camera, Check, Shuffle, UploadSimple, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { AvatarPreference, AvatarStyle } from "@/lib/avatar";
import { prepareAvatarUpload } from "@/lib/avatar-upload";
import { useAvatarPreferences } from "./avatar-preferences-provider";
import { IdentityAvatar } from "./identity-avatar";
import { PersonDirectoryAvatar } from "./person-directory-avatar";
import styles from "./avatar-editor.module.css";

const choices: { value: AvatarStyle; label: string }[] = [
  { value: "initials", label: "姓名" }, { value: "shapes", label: "几何" }, { value: "glass", label: "柔光" },
];

export function AvatarEditor({ id, label, url, self = false, size = 72, className, triggerLabel }: {
  id: string; label: string; url?: string | null; self?: boolean; size?: number; className?: string; triggerLabel?: string;
}) {
  const { store, people, defaultStyle } = useAvatarPreferences();
  const entity = self ? "self" : `person:${id}`;
  const seed = self ? store?.key ?? id : id;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AvatarPreference>({ style: "auto" });
  const [variationSeed, setVariationSeed] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const uploadVersion = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { uploadVersion.current++; }, []);

  function changeOpen(value: boolean) {
    uploadVersion.current++;
    setBusy(false); setError("");
    if (value) {
      setDraft(people[entity] ?? { style: "auto" });
      if (self) setVariationSeed(people[entity]?.seed ?? crypto.randomUUID());
    }
    setOpen(value);
  }
  async function selectFile(file: File | undefined) {
    if (!file) return;
    const version = ++uploadVersion.current;
    setBusy(true); setError("");
    try {
      const photo = await prepareAvatarUpload(file);
      if (version === uploadVersion.current) setDraft({ style: "auto", photo });
    } catch (reason) {
      if (version === uploadVersion.current) setError(reason instanceof Error ? reason.message : "图片无法读取，请换一张重试。");
    } finally { if (version === uploadVersion.current) setBusy(false); }
  }
  function save() {
    try {
      if (!store) throw new Error("scope unavailable");
      store.save(entity, draft.style === "auto" && !draft.photo ? undefined : draft);
      changeOpen(false);
    } catch { setError("没有保存成功。浏览器存储可能已满或被禁用；请释放空间后重试。"); }
  }
  function selectStyle(style: AvatarPreference["style"]) {
    setDraft(current => ({ ...current, style,
      seed: self && (style === "shapes" || style === "glass") ? variationSeed : undefined,
    }));
  }
  function shuffle() {
    const nextSeed = crypto.randomUUID();
    setVariationSeed(nextSeed);
    setDraft(current => ({ ...current, seed: nextSeed,
      style: current.style === "glass" ? "glass" : "shapes",
    }));
  }

  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild>
      <button type="button" className={`${styles.trigger} ${className ?? ""}`} disabled={!store} data-compact={size <= 40} data-labelled={Boolean(triggerLabel)}
        aria-label={self ? "编辑我的头像" : `编辑 ${label} 的头像`}>
        <PersonDirectoryAvatar id={id} label={label} url={url} self={self} size={size} />
        <span className={styles.camera}><Camera size={13} aria-hidden="true" /></span>
        {triggerLabel && <span className={styles.triggerLabel}>{triggerLabel}</span>}
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content data-avatar-editor="" className={`${styles.dialog} ts-workspace-theme quiet-workspace`} onKeyDown={event => event.stopPropagation()}>
        <div className={styles.heading}>
          <Dialog.Title className={styles.title}>{self ? "我的头像" : "联系人头像"}</Dialog.Title>
          <Dialog.Close className={styles.close} aria-label="关闭头像设置"><X size={18} /></Dialog.Close>
        </div>
        <Dialog.Description className={styles.description}>选一张照片，或挑一个喜欢的图案。</Dialog.Description>
        <div className={styles.preview}>
          <IdentityAvatar id={seed} label={label} url={url} size={88} defaultStyle={defaultStyle} preference={draft} />
          <strong>{label}</strong>
          <span>{draft.photo && draft.style === "auto" ? "自选图片" : draft.seed ? "选好后保存，头像就会保持不变" : draft.style === "auto" ? "优先照片，没有照片时使用默认风格" : "为这个头像单独设置"}</span>
          {self ? <button type="button" className={styles.shuffle} disabled={busy} onClick={shuffle}><Shuffle size={16} aria-hidden="true" />换一个</button> : null}
        </div>
        <fieldset className={styles.fieldset} disabled={busy}>
          <legend>显示方式</legend>
          <div className={styles.options}>
            {[{ value: "auto" as const, label: "自动" }, ...choices].map(choice => (
              <button type="button" key={choice.value} aria-pressed={draft.style === choice.value} className={styles.option}
                onClick={() => selectStyle(choice.value)}>
                <IdentityAvatar id={seed} label={label} url={url} size={40} defaultStyle={defaultStyle} preference={{ ...draft, style: choice.value,
                  seed: self && (choice.value === "shapes" || choice.value === "glass") ? variationSeed : undefined,
                }} />
                <span>{choice.label}</span>
                {draft.style === choice.value ? <Check className={styles.selected} aria-hidden="true" size={12} /> : null}
              </button>
            ))}
          </div>
        </fieldset>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择头像图片" className={styles.file}
          onChange={event => { void selectFile(event.target.files?.[0]); event.target.value = ""; }} />
        <button className={styles.upload} type="button" disabled={busy} onClick={() => input.current?.click()}>
          <UploadSimple aria-hidden="true" size={16} />{busy ? "正在处理图片…" : "上传图片"}
        </button>
        <p className={styles.hint}>JPG、PNG 或 WebP · 最大 8 MB · 居中裁切</p>
        <details className={styles.localData}><summary>保存范围与来源</summary><p>仅保存在此浏览器或应用的当前账号中，暂不跨设备同步。不会修改来源平台的照片。图案由 DiceBear 在本机生成。</p></details>
        {draft.photo ? <button className={styles.textButton} type="button" disabled={busy} onClick={() => setDraft(current => ({ style: current.style, seed: current.seed }))}>移除自选图片</button> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.footer}>
          <button className={styles.textButton} type="button" disabled={busy} onClick={() => setDraft({ style: "auto" })}>恢复默认</button>
          <div><Dialog.Close className={styles.secondary}>取消</Dialog.Close><button className={styles.primary} type="button" disabled={busy} onClick={save}>保存头像</button></div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function AvatarDefaultSettings() {
  const { store, defaultStyle } = useAvatarPreferences();
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(false);
  function select(value: AvatarStyle) {
    try { if (!store) return; store.setDefault(value); setError(""); }
    catch { setError("默认风格未保存，请检查浏览器存储后重试。"); }
  }
  return <section className={styles.settings} aria-label="默认头像风格">
    <div><h2>联系人默认头像</h2><p>没有照片时使用。单独设置过的联系人保持自己的风格。</p></div>
    <div className={styles.defaults}>
      {choices.map(choice => <button className={styles.defaultOption} disabled={!store} aria-pressed={defaultStyle === choice.value} key={choice.value} type="button" onClick={() => select(choice.value)}>
        <span className={styles.examples}>
          <IdentityAvatar id="example-1" label="张伟" size={40} preference={{ style: choice.value }} />
          <IdentityAvatar id="example-2" label="John Smith" size={40} preference={{ style: choice.value }} />
          <IdentityAvatar id="example-3" label="陈曦" size={40} preference={{ style: choice.value }} />
        </span>
        <span>{choice.label}{defaultStyle === choice.value ? <Check size={14} aria-hidden="true" /> : null}</span>
      </button>)}
    </div>
    <p className={styles.hint}>没有姓名时，使用稳定的抽象图案。</p>
    <details className={styles.localData}>
      <summary>管理本机头像数据</summary>
      <p>清除当前账号在此浏览器中上传的头像和风格设置，恢复已有来源照片与姓名头像。</p>
      {clearing ? <div><button className={styles.textButton} type="button" onClick={() => setClearing(false)}>保留设置</button><button className={styles.textButton} type="button" onClick={() => {
        try { store?.clear(); setClearing(false); setError(""); }
        catch { setError("未能清除本机头像数据，请检查浏览器存储后重试。"); }
      }}>确认清除</button></div> : <button className={styles.textButton} type="button" disabled={!store} onClick={() => setClearing(true)}>清除本机头像设置</button>}
    </details>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </section>;
}
