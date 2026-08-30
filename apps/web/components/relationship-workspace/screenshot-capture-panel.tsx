"use client";

import type { WorkspaceReviewResponse } from "@talent-signal/contracts";
import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  FileImage,
  PencilSimple,
  Plus,
  ShieldCheck,
  Sparkle,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createNormalizedRedaction,
  normalizedImagePoint,
  type NormalizedImagePoint,
  type NormalizedImageRedaction,
} from "@/lib/image-minimization";
import {
  fieldLabel,
  formatDate,
  initials,
  personContextSummary,
} from "./relationship-display";
import { personIdentityChoiceClues } from "@/lib/person-identity-choice";
import { useScreenshotCaptureController } from "./use-screenshot-capture-controller";

function BrowserLocalImage({
  accessibleName,
  source,
}: {
  accessibleName: string;
  source: Blob;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let decodedImage: ImageBitmap | null = null;
    void createImageBitmap(source)
      .then((image) => {
        decodedImage = image;
        if (cancelled) {
          image.close();
          return;
        }
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
          return;
        }
        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0);
      })
      .catch(() => {
        // The server analysis path reports invalid image bytes to the user.
      });
    return () => {
      cancelled = true;
      decodedImage?.close();
    };
  }, [source]);

  return <canvas aria-label={accessibleName} ref={canvasRef} role="img" />;
}
function ImageRedactionEditor({
  disabled,
  enabled,
  onAdd,
  onKeyboardAdjust,
  onKeyboardUndo,
  redactions,
  source,
}: {
  disabled: boolean;
  enabled: boolean;
  onAdd: (redaction: NormalizedImageRedaction) => void;
  onKeyboardAdjust: (
    direction: "down" | "left" | "right" | "up",
    resize: boolean,
  ) => void;
  onKeyboardUndo: () => void;
  redactions: NormalizedImageRedaction[];
  source: Blob;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const [imageRevision, setImageRevision] = useState(0);
  const [draft, setDraft] = useState<{
    end: NormalizedImagePoint;
    pointerId: number;
    start: NormalizedImagePoint;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let decodedImage: ImageBitmap | null = null;
    void createImageBitmap(source)
      .then((image) => {
        decodedImage = image;
        if (cancelled) {
          image.close();
          return;
        }
        imageRef.current = image;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = image.width;
          canvas.height = image.height;
        }
        setImageRevision((current) => current + 1);
      })
      .catch(() => {
        // The server analysis path reports invalid image bytes to the user.
      });
    return () => {
      cancelled = true;
      if (imageRef.current === decodedImage) {
        imageRef.current = null;
      }
      decodedImage?.close();
    };
  }, [source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !image || !context || imageRevision === 0) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const visibleRedactions = [
      ...redactions,
      ...(draft
        ? [
            createNormalizedRedaction(
              draft.start,
              draft.end,
              "redaction-preview",
            ),
          ].filter(
            (item): item is NormalizedImageRedaction => item !== null,
          )
        : []),
    ];
    context.fillStyle = "#11100f";
    for (const redaction of visibleRedactions) {
      context.fillRect(
        redaction.x * canvas.width,
        redaction.y * canvas.height,
        redaction.width * canvas.width,
        redaction.height * canvas.height,
      );
    }
  }, [draft, imageRevision, redactions]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    return normalizedImagePoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    );
  }

  function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!draft || draft.pointerId !== event.pointerId) {
      return;
    }
    const redaction = createNormalizedRedaction(
      draft.start,
      point(event),
      crypto.randomUUID(),
    );
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraft(null);
    if (redaction) {
      onAdd(redaction);
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (disabled || !enabled) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onAdd({
        height: 0.08,
        id: crypto.randomUUID(),
        width: 0.6,
        x: 0.2,
        y: 0.46,
      });
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onKeyboardUndo();
      return;
    }
    const direction = {
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
    }[event.key] as "down" | "left" | "right" | "up" | undefined;
    if (direction) {
      event.preventDefault();
      onKeyboardAdjust(direction, event.shiftKey);
    }
  }

  return (
    <canvas
      aria-describedby="capture-redaction-help capture-redaction-status"
      aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Delete"
      aria-label={
        enabled
          ? "对话截图遮挡编辑器。拖动以遮挡，或使用说明中的键盘控制。"
          : "已选择的对话截图，正在预览本地遮挡效果。"
      }
      aria-roledescription="图片遮挡编辑器"
      data-redacting={enabled}
      onKeyDown={onKeyDown}
      onPointerCancel={() => setDraft(null)}
      onPointerDown={(event) => {
        if (disabled || !enabled) {
          return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const start = point(event);
        setDraft({ end: start, pointerId: event.pointerId, start });
      }}
      onPointerMove={(event) => {
        if (!draft || draft.pointerId !== event.pointerId) {
          return;
        }
        event.preventDefault();
        const nextPoint = point(event);
        setDraft((current) =>
          current ? { ...current, end: nextPoint } : current,
        );
      }}
      onPointerUp={finish}
      ref={canvasRef}
      role="img"
      tabIndex={enabled && !disabled ? 0 : -1}
    />
  );
}

export function CapturePanel({
  onClose,
  onCommitted,
}: {
  onClose: () => void;
  onCommitted: (workspace: WorkspaceReviewResponse) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const {
    actions: {
      addRedaction,
      adjustLatestRedaction,
      analyze,
      cancelAnalysis,
      chooseFile,
      clearPerson,
      clearRedactions,
      commit,
      continueToReview,
      createNewContext: beginNewContext,
      createNewPerson: beginNewPerson,
      goToBinding,
      goToSelect,
      resetReview,
      selectContext,
      selectPerson,
      setAssignmentLabel,
      setContactName,
      setCropBottomPercent,
      setCropTopPercent,
      setDragging,
      setScreenshotOwner,
      setTranscriptEditing,
      toggleRedactionMode,
      undoRedaction,
      updateReviewedMessage,
    },
    derived: {
      ambiguousPersonIds,
      contactQueryIsHandle,
      draft,
      hasAmbiguousPeople,
      identityDecided,
      matchingPeople,
      relationshipDecided,
      reviewImage,
      selectedPerson,
      transcriptEdited,
    },
    inputRef,
    state: {
      analysis,
      analysisStatus,
      assignmentLabel,
      contactName,
      createNewContext,
      createNewPerson,
      cropBottomPercent,
      cropTopPercent,
      dragging,
      error,
      file,
      peopleLoading,
      peopleLookupFailed,
      phase,
      redactionMode,
      redactions,
      screenshotOwner,
      selectedContextId,
      selectedPersonId,
      transcriptEditing,
    },
    wasCommitted,
  } = useScreenshotCaptureController({ onCommitted });

  useEffect(() => {
    const returnTarget = returnFocusRef.current;
    return () => {
      if (wasCommitted()) {
        return;
      }
      if (
        !returnTarget ||
        returnTarget === document.body ||
        !returnTarget.isConnected
      ) {
        return;
      }
      window.requestAnimationFrame(() => {
        returnTarget.focus({ preventScroll: true });
      });
    };
  }, [wasCommitted]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0] ?? null);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (phase !== "select") {
      return;
    }
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open && phase !== "committing") {
          onClose();
        }
      }}
      open
    >
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <div className="context-capture-backdrop">
            <Dialog.Content
              asChild
              onEscapeKeyDown={(event) => {
                if (phase === "committing") {
                  event.preventDefault();
                }
              }}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                dialogRef.current?.focus({ preventScroll: true });
              }}
              onPointerDownOutside={(event) => {
                if (phase === "committing") {
                  event.preventDefault();
                }
              }}
            >
              <section
                className="context-capture"
                ref={dialogRef}
                tabIndex={-1}
              >
        <header className="context-capture__header">
          <div>
            <p className="eyebrow">新依据</p>
            <Dialog.Title asChild>
              <h2 id="capture-title">
                {phase === "review" || phase === "committing"
                  ? "审阅截图能够支持的内容"
                  : phase === "binding"
                    ? "将来源绑定到一段关系"
                    : "导入对话截图"}
              </h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <p>
                只有你保留的图像区域会发送给已配置的云端提供方分析。原图仅在本次审阅期间留在浏览器内存中，不会存储。已审阅文字与依据引文最长保留 30 天，也可提前删除。
              </p>
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <button
              aria-label="关闭采集"
              className="context-icon-button"
              disabled={phase === "committing"}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </Dialog.Close>
        </header>

        {error ? (
          <div className="context-inline-alert" role="alert">
            <Warning aria-hidden="true" size={20} weight="duotone" />
            <p>{error}</p>
          </div>
        ) : null}

        {analysisStatus ? (
          <div
            aria-live="polite"
            className="context-analysis-status"
            role="status"
          >
            {phase === "analyzing" ? (
              <CircleNotch aria-hidden="true" className="spin" size={17} />
            ) : (
              <ShieldCheck aria-hidden="true" size={17} weight="duotone" />
            )}
            <p>{analysisStatus}</p>
          </div>
        ) : null}

        {phase === "select" ||
        phase === "analyzing" ||
        phase === "binding" ? (
          <>
            <div className="context-capture__select">
              <div className="context-capture__identity">
              {phase !== "binding" ? (
                <fieldset className="context-capture__owner">
                  <legend>这是谁的屏幕？</legend>
                  <div>
                    {([
                      ["recruiter", "我的"],
                      ["candidate", "候选人的"],
                      ["unknown", "不确定"],
                    ] as const).map(([value, label]) => (
                      <button
                        aria-pressed={screenshotOwner === value}
                        disabled={phase !== "select"}
                        key={value}
                        onClick={() => setScreenshotOwner(value)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <small>
                    这会影响对气泡位置的解释。不确定时，说话人会保持未分配，等待审阅。
                  </small>
                </fieldset>
              ) : null}
              {phase === "binding" ? (
                <>
              <label>
                <span>联系人</span>
                <input
                  autoComplete="off"
                  maxLength={160}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder="例如：林晓 / Maya Chen"
                  value={contactName}
                />
                <small>
                  身份由你绑定；模型不会根据猜测的姓名创建人物记录。
                </small>
              </label>
              <div
                aria-live="polite"
                className="context-identity-resolution"
              >
                {selectedPerson ? (
                  <div
                    className="context-identity-decision"
                    data-state="selected"
                  >
                    <span>
                      <CheckCircle aria-hidden="true" size={18} weight="fill" />
                    </span>
                    <p>
                      <strong>使用现有人物 · {selectedPerson.display_label}</strong>
                      <small>
                        {selectedPerson.context_count} 段关系背景 · {selectedPerson.capture_count} 次采集
                      </small>
                    </p>
                    <button
                      className="context-text-button"
                      onClick={clearPerson}
                      type="button"
                    >
                      更改
                    </button>
                  </div>
                ) : createNewPerson ? (
                  <div
                    className="context-identity-decision"
                    data-state="new"
                  >
                    <span>
                      <Plus aria-hidden="true" size={18} />
                    </span>
                    <p>
                      <strong>将“{contactName.trim()}”创建为新人物</strong>
                      <small>
                        这不会与任何同名人物合并。
                      </small>
                    </p>
                    <button
                      className="context-text-button"
                      onClick={clearPerson}
                      type="button"
                    >
                      更改
                    </button>
                  </div>
                ) : contactName.trim() ? (
                  <>
                    <div className="context-identity-resolution__heading">
                      <span>确认人物身份</span>
                      <small>
                        {peopleLoading
                          ? "正在检查现有人才……"
                          : "姓名仅作建议，绑定由你决定。"}
                      </small>
                    </div>
                    {!peopleLoading && matchingPeople.length > 0 ? (
                      <div className="context-identity-options">
                        {matchingPeople.map((person) => (
                          <button
                            aria-describedby={
                              ambiguousPersonIds.has(person.id)
                                ? "capture-identity-ambiguity"
                                : undefined
                            }
                            data-ambiguous={ambiguousPersonIds.has(person.id)}
                            disabled={ambiguousPersonIds.has(person.id)}
                            key={person.id}
                            onClick={() => selectPerson(person)}
                            type="button"
                          >
                            <span>{initials(person.display_label)}</span>
                            <p>
                              <strong>{person.display_label}</strong>
                              <small>
                                {personIdentityChoiceClues(person)
                                  .slice(0, 2)
                                  .join(" · ") || "没有可核对的稳定身份线索"}
                              </small>
                              <small>
                                {personContextSummary(person)} · 最近活动{" "}
                                {formatDate(person.last_activity_at)} · {person.capture_count} 次采集
                              </small>
                            </p>
                            {ambiguousPersonIds.has(person.id) ? (
                              <Warning aria-hidden="true" size={16} />
                            ) : (
                              <ArrowRight aria-hidden="true" size={16} />
                            )}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {!peopleLoading && hasAmbiguousPeople ? (
                      <div
                        className="context-identity-ambiguity"
                        id="capture-identity-ambiguity"
                        role="alert"
                      >
                        <Warning aria-hidden="true" size={18} />
                        <p>
                          <strong>这些同名人物还无法安全区分。</strong>
                          <small>
                            已暂停绑定和新建。请先在人物页面补充已确认身份线索或完成重复身份审阅；截图尚未保存。
                          </small>
                        </p>
                      </div>
                    ) : null}
                    {!peopleLoading &&
                    !peopleLookupFailed &&
                    !contactQueryIsHandle &&
                    !hasAmbiguousPeople ? (
                      <button
                        className="context-create-person"
                        onClick={beginNewPerson}
                        type="button"
                      >
                        <Plus aria-hidden="true" size={16} />
                        新建人物“{contactName.trim()}”
                      </button>
                    ) : null}
                    {!peopleLoading &&
                    !peopleLookupFailed &&
                    contactQueryIsHandle &&
                    matchingPeople.length === 0 ? (
                      <p className="context-start__lookup-note">
                        当前或历史归属中均未匹配到这条已遮蔽的身份线索。创建新身份前，请输入姓名。
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="context-identity-resolution__empty">
                    输入姓名，然后选择现有人物或确认新建。
                  </p>
                )}
              </div>
              {selectedPerson ? (
                <div className="context-start__contexts context-capture__contexts">
                  <span>选择关系背景</span>
                  {selectedPerson.contexts.map((context) => (
                    <button
                      data-selected={selectedContextId === context.id}
                      key={context.id}
                      onClick={() =>
                        selectContext(context.id, context.display_label)
                      }
                      type="button"
                    >
                      {context.display_label}
                    </button>
                  ))}
                  <button
                    data-selected={createNewContext}
                    onClick={beginNewContext}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={15} />
                    新建关系背景
                  </button>
                </div>
              ) : null}
              {createNewPerson || createNewContext ? (
                <label>
                  <span>关系背景</span>
                  <input
                    autoComplete="off"
                    maxLength={200}
                    onChange={(event) =>
                      setAssignmentLabel(event.target.value)
                    }
                    placeholder="例如：产品副总裁 · Northstar 寻访"
                    value={assignmentLabel}
                  />
                  <small>
                    事实始终限定在此寻访或关系范围内。
                  </small>
                </label>
              ) : null}
                </>
              ) : null}
              </div>

              <div
                className="context-dropzone"
              data-dragging={dragging}
              data-selected={Boolean(file)}
              onDragEnter={(event) => {
                event.preventDefault();
                if (phase === "select") {
                  setDragging(true);
                }
              }}
              onDragLeave={() => setDragging(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
            >
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={onFileChange}
                ref={inputRef}
                tabIndex={-1}
                type="file"
              />
              {file ? (
                <div className="context-dropzone__preview">
                  <div
                    className="context-dropzone__crop-image"
                    style={
                      {
                        "--crop-bottom": `${100 - cropBottomPercent}%`,
                        "--crop-top": `${cropTopPercent}%`,
                      } as CSSProperties
                    }
                  >
                    <ImageRedactionEditor
                      disabled={phase !== "select"}
                      enabled={redactionMode}
                      onAdd={addRedaction}
                      onKeyboardAdjust={adjustLatestRedaction}
                      onKeyboardUndo={undoRedaction}
                      redactions={redactions}
                      source={file}
                    />
                    <i aria-hidden="true" data-edge="top" />
                    <i aria-hidden="true" data-edge="bottom" />
                  </div>
                  <div>
                    <FileImage aria-hidden="true" size={20} />
                    <p>
                      <strong>{file?.name}</strong>
                      <span>
                        {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ""}
                      </span>
                    </p>
                    <button
                      className="context-text-button"
                      disabled={phase !== "select"}
                      onClick={() => inputRef.current?.click()}
                      type="button"
                    >
                      替换
                    </button>
                    <fieldset className="context-crop-controls">
                      <legend>云端分析前最小化范围</legend>
                      <label>
                        <span>从 {cropTopPercent}% 开始保留</span>
                        <input
                          disabled={phase !== "select"}
                          max={cropBottomPercent - 10}
                          min="0"
                          onChange={(event) =>
                            setCropTopPercent(Number(event.target.value))
                          }
                          type="range"
                          value={cropTopPercent}
                        />
                      </label>
                      <label>
                        <span>保留至 {cropBottomPercent}%</span>
                        <input
                          disabled={phase !== "select"}
                          max="100"
                          min={cropTopPercent + 10}
                          onChange={(event) =>
                            setCropBottomPercent(Number(event.target.value))
                          }
                          type="range"
                          value={cropBottomPercent}
                        />
                      </label>
                      <small>
                        阴影裁剪区域的像素绝不会离开此浏览器。
                      </small>
                    </fieldset>
                    <div className="context-redaction-controls">
                      <button
                        aria-pressed={redactionMode}
                        className="context-redaction-toggle"
                        disabled={phase !== "select"}
                        onClick={toggleRedactionMode}
                        type="button"
                      >
                        <PencilSimple aria-hidden="true" size={15} />
                        {redactionMode ? "完成遮蔽" : "遮蔽隐私信息"}
                      </button>
                      <span
                        aria-live="polite"
                        className="sr-only"
                        id="capture-redaction-status"
                      >
                        {redactions.length === 0
                          ? "尚未添加本地遮罩。"
                          : `已添加 ${redactions.length} 个本地遮罩。`}
                      </span>
                      {redactions.length > 0 ? (
                        <div>
                          <span>
                            {redactions.length} 个本地遮罩
                          </span>
                          <button
                            disabled={phase !== "select"}
                            onClick={undoRedaction}
                            type="button"
                          >
                            撤销
                          </button>
                          <button
                            disabled={phase !== "select"}
                            onClick={clearRedactions}
                            type="button"
                          >
                            清除
                          </button>
                        </div>
                      ) : null}
                      <small id="capture-redaction-help">
                        打开遮蔽后，在姓名、电话号码或无关消息上拖动。上传前遮罩会压平到图像中，模型无法恢复。键盘：聚焦图像后按 Enter 添加遮罩，方向键移动，Shift + 方向键调整大小，Delete 撤销。
                      </small>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <span className="context-dropzone__icon">
                    <UploadSimple aria-hidden="true" size={24} />
                  </span>
                  <div>
                    <strong>拖入一张对话截图</strong>
                    <p>JPEG、PNG 或 WebP · 最大 8 MB</p>
                  </div>
                  <button
                    className="context-secondary-button"
                    onClick={() => inputRef.current?.click()}
                    type="button"
                  >
                    选择截图
                  </button>
                </>
              )}
              </div>

              <div className="context-capture__privacy">
                <ShieldCheck aria-hidden="true" size={19} weight="duotone" />
                <p>
                  <strong>
                    {phase === "binding"
                      ? "来源已读取 · 身份仍由你决定"
                      : phase === "analyzing"
                        ? "正在进行临时分析"
                      : "继续之前"}
                  </strong>
                  {phase === "binding"
                    ? "模型没有创建人物。请选择现有人物或明确创建新人物，再命名关系背景。"
                    : phase === "analyzing"
                      ? "可以安全取消：完成审阅并明确提交前，不会保存来源、人物或联系人。"
                      : "只上传你获准处理的对话。每项提取事实在成为联系人背景前都需审阅。"}
                </p>
              </div>
            </div>

            <footer className="context-capture__footer">
              <button
                className="context-secondary-button"
                onClick={() => {
                  if (phase === "analyzing") {
                    cancelAnalysis();
                    return;
                  }
                  if (phase === "binding") {
                    goToSelect();
                    return;
                  }
                  onClose();
                }}
                type="button"
              >
                {phase === "analyzing"
                  ? "取消分析"
                  : phase === "binding"
                    ? "返回来源"
                    : "取消"}
              </button>
              <button
                className="context-primary-button"
                disabled={
                  phase === "analyzing" ||
                  !file ||
                  (phase === "binding" &&
                    (!contactName.trim() ||
                      !assignmentLabel.trim() ||
                      !identityDecided ||
                      !relationshipDecided))
                }
                onClick={() => {
                  if (phase === "binding") {
                    continueToReview();
                    return;
                  }
                  void analyze();
                }}
                type="button"
              >
                {phase === "analyzing" ? (
                  <CircleNotch
                    aria-hidden="true"
                    className="spin"
                    size={18}
                  />
                ) : (
                  <Sparkle aria-hidden="true" size={18} weight="fill" />
                )}
                {phase === "analyzing"
                  ? "正在读取截图"
                  : phase === "binding"
                    ? "继续依据审阅"
                    : "读取来源"}
              </button>
            </footer>
          </>
        ) : null}

        {(phase === "review" || phase === "committing") && draft ? (
          <div className="context-capture__review">
            <div className="context-review-source">
              <div className="context-review-source__image">
                {reviewImage ? (
                  <BrowserLocalImage
                    accessibleName="正在审阅的准确对话截图分析区域"
                    source={reviewImage}
                  />
                ) : null}
              </div>
              <div className="context-review-source__meta">
                <span>
                  <ShieldCheck aria-hidden="true" size={15} />
                  原图不存储 · 已压平 {redactions.length} 个本地遮罩 · 已审阅文字最长保留 30 天
                </span>
                <span>
                  {analysis?.meta.provider} · {analysis?.meta.model} · {draft.platform}
                </span>
              </div>
            </div>

            <div className="context-review-draft">
              <div className="context-review-binding">
                <span>{initials(contactName)}</span>
                <div>
                  <strong>{contactName}</strong>
                  <small>{assignmentLabel}</small>
                </div>
                <p>
                  {selectedPersonId
                    ? "你选择的现有人物"
                    : "你确认的新人物"}
                </p>
              </div>

              {draft.transcription_notes.length > 0 ? (
                <div className="context-transcription-notes">
                  <Warning aria-hidden="true" size={18} />
                  <div>
                    <strong>可见限制</strong>
                    {draft.transcription_notes.map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              <section aria-labelledby="transcription-title">
                <div className="context-review-heading">
                  <h3 id="transcription-title">对话转写</h3>
                  <div className="context-review-heading__actions">
                    <span>{draft.messages.length} 条消息</span>
                    {transcriptEditing ? (
                      <>
                        <button
                          disabled={!transcriptEdited}
                          onClick={() => setTranscriptEditing(false)}
                          type="button"
                        >
                          完成
                        </button>
                        <button
                          onClick={() => {
                            resetReview();
                          }}
                          type="button"
                        >
                          重置
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setTranscriptEditing(true)}
                        type="button"
                      >
                        编辑转写
                      </button>
                    )}
                  </div>
                </div>
                {transcriptEdited ? (
                  <div className="context-human-edit-note" role="status">
                    <PencilSimple aria-hidden="true" size={17} />
                    <p>
                      <strong>招聘顾问编辑的转写</strong>
                      模型衍生事实与行动已移除。此来源将以人工草拟文字进入审阅，不包含自动操作声明。
                    </p>
                  </div>
                ) : null}
                <div className="context-transcript">
                  {draft.messages.map((message) => (
                    <div
                      data-speaker={message.speaker}
                      key={message.source_message_id}
                    >
                      {transcriptEditing ? (
                        <>
                          <label>
                            <span className="sr-only">说话人</span>
                            <select
                              aria-label={`消息 ${message.sequence + 1} 的说话人`}
                              onChange={(event) =>
                                updateReviewedMessage(
                                  message.source_message_id,
                                  {
                                    speaker: event.target.value as
                                      | "candidate"
                                      | "recruiter"
                                      | "unknown",
                                  },
                                )
                              }
                              value={message.speaker}
                            >
                              <option value="candidate">候选人</option>
                              <option value="recruiter">招聘顾问</option>
                              <option value="unknown">不确定</option>
                            </select>
                          </label>
                          <textarea
                            aria-label={`消息 ${message.sequence + 1} 的文字`}
                            maxLength={4_000}
                            onChange={(event) =>
                              updateReviewedMessage(
                                message.source_message_id,
                                { text: event.target.value },
                              )
                            }
                            rows={3}
                            value={message.text}
                          />
                        </>
                      ) : (
                        <>
                          <span>{message.speaker}</span>
                          <p>{message.text}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section aria-labelledby="draft-facts-title">
                <div className="context-review-heading">
                  <h3 id="draft-facts-title">拟议事实</h3>
                  <span>{draft.assertions.length}</span>
                </div>
                {draft.assertions.length > 0 ? (
                  <div className="context-draft-facts">
                    {draft.assertions.map((assertion) => (
                      <article
                        data-state={assertion.status}
                        key={`${assertion.field}:${assertion.evidence_message_id}`}
                      >
                        <div>
                          <span>{fieldLabel(assertion.field)}</span>
                          <strong>{assertion.value}</strong>
                        </div>
                        <span
                          className="context-draft-fact__status"
                          data-state={assertion.status}
                        >
                          {assertion.status === "ambiguous"
                            ? "确认前需要澄清"
                            : "仅为提议 · 尚未记忆"}
                        </span>
                        <blockquote>“{assertion.evidence_quote}”</blockquote>
                        {assertion.ambiguity ? (
                          <p>
                            <Warning aria-hidden="true" size={15} />
                            {assertion.ambiguity}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="context-no-signal">
                    <CheckCircle aria-hidden="true" size={22} />
                    <p>
                      <strong>未发现可操作更新</strong>
                      截图仍可作为已审阅背景保留，不会创建事实或下一步。
                    </p>
                  </div>
                )}
              </section>

              {draft.action ? (
                <div className="context-draft-action">
                  <Sparkle aria-hidden="true" size={19} weight="duotone" />
                  <p>
                    <span>建议的内部下一步</span>
                    <strong>{draft.action.target}</strong>
                    <small>{draft.action.reason}</small>
                  </p>
                </div>
              ) : null}
            </div>

            <footer className="context-capture__footer context-capture__footer--review">
              <p>
                提交只会创建提议；你仍需在联系人页面逐项确认或驳回事实。
              </p>
              <button
                className="context-secondary-button"
                disabled={phase === "committing"}
                onClick={() => {
                  goToBinding();
                }}
                type="button"
              >
                返回
              </button>
              <button
                className="context-primary-button"
                disabled={
                  phase === "committing" ||
                  transcriptEditing ||
                  draft.messages.some((message) => !message.text.trim())
                }
                onClick={commit}
                type="button"
              >
                {phase === "committing" ? (
                  <CircleNotch
                    aria-hidden="true"
                    className="spin"
                    size={18}
                  />
                ) : (
                  <ArrowRight aria-hidden="true" size={18} />
                )}
                {phase === "committing"
                  ? "正在创建审阅"
                  : "提交到依据审阅"}
              </button>
            </footer>
          </div>
        ) : null}
              </section>
            </Dialog.Content>
          </div>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
