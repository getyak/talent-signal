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
  initials,
  personContextSummary,
} from "./relationship-display";
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
          ? "Conversation screenshot redaction editor. Drag to mask, or use the documented keyboard controls."
          : "Selected conversation screenshot with local redactions previewed."
      }
      aria-roledescription="image redaction editor"
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
      contactQueryIsHandle,
      draft,
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
            <p className="eyebrow">NEW EVIDENCE</p>
            <Dialog.Title asChild>
              <h2 id="capture-title">
                {phase === "review" || phase === "committing"
                  ? "Review what the screenshot supports"
                  : phase === "binding"
                    ? "Bind the source to one relationship"
                    : "Import a conversation screenshot"}
              </h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <p>
                Only the image region you keep is sent to the configured cloud
                provider for analysis. The original stays in browser memory for
                this review and is not stored. Reviewed text and evidence quotes
                are kept for up to 30 days, and can be deleted sooner.
              </p>
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <button
              aria-label="Close capture"
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
                  <legend>Whose screen is this?</legend>
                  <div>
                    {([
                      ["recruiter", "Mine"],
                      ["candidate", "Candidate's"],
                      ["unknown", "Not sure"],
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
                    This determines how bubble position may be interpreted. When
                    unsure, speakers stay unassigned until review.
                  </small>
                </fieldset>
              ) : null}
              {phase === "binding" ? (
                <>
              <label>
                <span>Contact</span>
                <input
                  autoComplete="off"
                  maxLength={160}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder="e.g. 林晓 / Maya Chen"
                  value={contactName}
                />
                <small>
                  You bind the identity. The model does not create a person
                  record from a guessed name.
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
                      <strong>Use existing person · {selectedPerson.display_label}</strong>
                      <small>
                        {selectedPerson.context_count} relationship{" "}
                        {selectedPerson.context_count === 1
                          ? "context"
                          : "contexts"}{" "}
                        · {selectedPerson.capture_count} captures
                      </small>
                    </p>
                    <button
                      className="context-text-button"
                      onClick={clearPerson}
                      type="button"
                    >
                      Change
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
                      <strong>Create “{contactName.trim()}” as a new person</strong>
                      <small>
                        This will not merge with anyone who has the same name.
                      </small>
                    </p>
                    <button
                      className="context-text-button"
                      onClick={clearPerson}
                      type="button"
                    >
                      Change
                    </button>
                  </div>
                ) : contactName.trim() ? (
                  <>
                    <div className="context-identity-resolution__heading">
                      <span>Resolve the person</span>
                      <small>
                        {peopleLoading
                          ? "Checking existing people…"
                          : "Names are suggestions only. You make the binding."}
                      </small>
                    </div>
                    {!peopleLoading && matchingPeople.length > 0 ? (
                      <div className="context-identity-options">
                        {matchingPeople.map((person) => (
                          <button
                            key={person.id}
                            onClick={() => selectPerson(person)}
                            type="button"
                          >
                            <span>{initials(person.display_label)}</span>
                            <p>
                              <strong>{person.display_label}</strong>
                              <small>
                                {personContextSummary(person)}{" "}
                                · {person.capture_count} captures
                              </small>
                            </p>
                            <ArrowRight aria-hidden="true" size={16} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {!peopleLoading &&
                    !peopleLookupFailed &&
                    !contactQueryIsHandle ? (
                      <button
                        className="context-create-person"
                        onClick={beginNewPerson}
                        type="button"
                      >
                        <Plus aria-hidden="true" size={16} />
                        Create a new person named “{contactName.trim()}”
                      </button>
                    ) : null}
                    {!peopleLoading &&
                    !peopleLookupFailed &&
                    contactQueryIsHandle &&
                    matchingPeople.length === 0 ? (
                      <p className="context-start__lookup-note">
                        No current or historical owner matched this masked
                        identity clue. Enter the person&apos;s name before creating
                        a new identity.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="context-identity-resolution__empty">
                    Enter a name, then choose an existing person or confirm a
                    new one.
                  </p>
                )}
              </div>
              {selectedPerson ? (
                <div className="context-start__contexts context-capture__contexts">
                  <span>Choose the relationship context</span>
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
                    New relationship context
                  </button>
                </div>
              ) : null}
              {createNewPerson || createNewContext ? (
                <label>
                  <span>Relationship context</span>
                  <input
                    autoComplete="off"
                    maxLength={200}
                    onChange={(event) =>
                      setAssignmentLabel(event.target.value)
                    }
                    placeholder="e.g. VP Product · Northstar search"
                    value={assignmentLabel}
                  />
                  <small>
                    Facts remain scoped to this search or relationship.
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
                      Replace
                    </button>
                    <fieldset className="context-crop-controls">
                      <legend>Minimize before cloud analysis</legend>
                      <label>
                        <span>Keep from {cropTopPercent}%</span>
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
                        <span>Keep through {cropBottomPercent}%</span>
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
                        Shaded crop pixels never leave this browser.
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
                        {redactionMode ? "Finish masking" : "Mask private details"}
                      </button>
                      <span
                        aria-live="polite"
                        className="sr-only"
                        id="capture-redaction-status"
                      >
                        {redactions.length === 0
                          ? "No local masks added."
                          : `${redactions.length} local ${
                              redactions.length === 1 ? "mask" : "masks"
                            } added.`}
                      </span>
                      {redactions.length > 0 ? (
                        <div>
                          <span>
                            {redactions.length} local mask
                            {redactions.length === 1 ? "" : "s"}
                          </span>
                          <button
                            disabled={phase !== "select"}
                            onClick={undoRedaction}
                            type="button"
                          >
                            Undo
                          </button>
                          <button
                            disabled={phase !== "select"}
                            onClick={clearRedactions}
                            type="button"
                          >
                            Clear
                          </button>
                        </div>
                      ) : null}
                      <small id="capture-redaction-help">
                        Turn masking on, then drag over names, phone numbers, or
                        unrelated messages. Masks are flattened into the image
                        before any upload and cannot be recovered by the model.
                        Keyboard: focus the image, press Enter to add a mask,
                        arrows to move, Shift + arrows to resize, and Delete to
                        undo.
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
                    <strong>Drop one conversation screenshot</strong>
                    <p>JPEG, PNG, or WebP · up to 8 MB</p>
                  </div>
                  <button
                    className="context-secondary-button"
                    onClick={() => inputRef.current?.click()}
                    type="button"
                  >
                    Choose screenshot
                  </button>
                </>
              )}
              </div>

              <div className="context-capture__privacy">
                <ShieldCheck aria-hidden="true" size={19} weight="duotone" />
                <p>
                  <strong>
                    {phase === "binding"
                      ? "Source read · identity still yours"
                      : phase === "analyzing"
                        ? "Transient analysis in progress"
                      : "Before you continue"}
                  </strong>
                  {phase === "binding"
                    ? "The model did not create a person. Choose an existing person or explicitly create a new one, then name the relationship context."
                    : phase === "analyzing"
                      ? "Canceling is safe: no source, person, or contact is saved until you finish review and explicitly commit it."
                      : "Only upload a conversation you are authorized to process. Review every extracted fact before it becomes contact context."}
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
                  ? "Cancel analysis"
                  : phase === "binding"
                    ? "Back to source"
                    : "Cancel"}
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
                  ? "Reading screenshot"
                  : phase === "binding"
                    ? "Continue to evidence review"
                    : "Read source"}
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
                    accessibleName="Exact conversation screenshot region analyzed and being reviewed"
                    source={reviewImage}
                  />
                ) : null}
              </div>
              <div className="context-review-source__meta">
                <span>
                  <ShieldCheck aria-hidden="true" size={15} />
                  Original not stored · {redactions.length} local mask
                  {redactions.length === 1 ? "" : "s"} flattened · reviewed text
                  retained up to 30 days
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
                    ? "Existing person selected by you"
                    : "New person confirmed by you"}
                </p>
              </div>

              {draft.transcription_notes.length > 0 ? (
                <div className="context-transcription-notes">
                  <Warning aria-hidden="true" size={18} />
                  <div>
                    <strong>Visible limits</strong>
                    {draft.transcription_notes.map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              <section aria-labelledby="transcription-title">
                <div className="context-review-heading">
                  <h3 id="transcription-title">Transcription</h3>
                  <div className="context-review-heading__actions">
                    <span>{draft.messages.length} messages</span>
                    {transcriptEditing ? (
                      <>
                        <button
                          disabled={!transcriptEdited}
                          onClick={() => setTranscriptEditing(false)}
                          type="button"
                        >
                          Done
                        </button>
                        <button
                          onClick={() => {
                            resetReview();
                          }}
                          type="button"
                        >
                          Reset
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setTranscriptEditing(true)}
                        type="button"
                      >
                        Edit transcription
                      </button>
                    )}
                  </div>
                </div>
                {transcriptEdited ? (
                  <div className="context-human-edit-note" role="status">
                    <PencilSimple aria-hidden="true" size={17} />
                    <p>
                      <strong>Recruiter-edited transcription</strong>
                      Model-derived facts and actions were removed. This source
                      will enter review as human-drafted text with no automatic
                      operational claim.
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
                            <span className="sr-only">Speaker</span>
                            <select
                              aria-label={`Speaker for message ${message.sequence + 1}`}
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
                              <option value="candidate">Candidate</option>
                              <option value="recruiter">Recruiter</option>
                              <option value="unknown">Not sure</option>
                            </select>
                          </label>
                          <textarea
                            aria-label={`Text for message ${message.sequence + 1}`}
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
                  <h3 id="draft-facts-title">Proposed facts</h3>
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
                            ? "Needs clarification before confirmation"
                            : "Proposal only · not remembered"}
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
                      <strong>No operational update found</strong>
                      The screenshot can still be retained as reviewed context
                      without creating a fact or next move.
                    </p>
                  </div>
                )}
              </section>

              {draft.action ? (
                <div className="context-draft-action">
                  <Sparkle aria-hidden="true" size={19} weight="duotone" />
                  <p>
                    <span>Suggested internal next move</span>
                    <strong>{draft.action.target}</strong>
                    <small>{draft.action.reason}</small>
                  </p>
                </div>
              ) : null}
            </div>

            <footer className="context-capture__footer context-capture__footer--review">
              <p>
                Committing creates proposals only. You will still confirm or
                dismiss each fact on the contact page.
              </p>
              <button
                className="context-secondary-button"
                disabled={phase === "committing"}
                onClick={() => {
                  goToBinding();
                }}
                type="button"
              >
                Back
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
                  ? "Creating review"
                  : "Commit to evidence review"}
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
