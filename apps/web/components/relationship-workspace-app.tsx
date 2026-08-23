"use client";

import {
  CONTRACT_VERSION,
  maskIdentityHandle,
  parseIdentityHandleQuery,
  type ChatTaskResponse,
  type EffectReversalPreview,
  type IdentityHandleType,
  type IdentityResolutionCase,
  type IdentityResolutionDecisionResponse,
  type KnowledgeSnapshot,
  type PersonDirectoryItem,
  type PersonMergePreview,
  type PersonMergeResponse,
  type PersonMergeReversalPreview,
  type PublicResearchResponse,
  type RelationshipAgentHistory,
  type RelationshipResourceDetail,
  type RelationshipResourceListItem,
  type RelationshipScope,
  type ResourceCaptureResponse,
  type SourceAuthorizationDecisionResponse,
  type WorkspaceReviewResponse,
} from "@talent-signal/contracts";
import {
  AddressBook,
  ArrowRight,
  ChatCircleDots,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  FileImage,
  House,
  LinkSimple,
  PencilSimple,
  Plus,
  Prohibit,
  Quotes,
  ShieldCheck,
  SignOut,
  Sparkle,
  Trash,
  UploadSimple,
  UserPlus,
  Warning,
  X,
} from "@phosphor-icons/react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type AgentPersonTarget,
  agentPersonOutcome,
  agentPersonScopeFields,
  agentRelationshipContexts,
  canSelectPersonForIdentityClue,
  canCreateDistinctPerson,
  confirmedHandlePersonMatches,
  exactPersonNameMatches,
  expiredHandlePersonMatches,
  mergePersonDirectoryMatches,
  personIdentityTemporalRole,
} from "@/lib/agent-person-resolution";
import { resolveAgentUiCommand } from "@/lib/agent-ui-command";
import {
  createNormalizedRedaction,
  normalizedImagePoint,
  redactionInPreparedImage,
  type NormalizedImagePoint,
  type NormalizedImageRedaction,
} from "@/lib/image-minimization";
import {
  CONVERSATION_SPEAKERS,
  parseConversationTranscript,
  type ConversationSpeaker,
  type ConversationTranscriptMessage,
} from "@/lib/conversation-transcript";
import type {
  ScreenshotAnalysisMeta,
  ScreenshotCaptureDraft,
  ScreenshotOwnerRole,
} from "@/lib/screenshot-capture";
import { signOutOfWorkspace } from "@/app/login/actions";

import { ThemeToggle } from "./theme-toggle";

type Props = {
  initialAgentHistory: RelationshipAgentHistory | null;
  initialIdentityResolutionCase: IdentityResolutionCase | null;
  initialKnowledgeSnapshot: KnowledgeSnapshot | null;
  initialWorkspace: WorkspaceReviewResponse | null;
  initialRelationshipScope: RelationshipScope | null;
  initialError: string | null;
  user: {
    email?: string | null;
    name?: string | null;
  };
};

type CaptureAnalysis = {
  draft: ScreenshotCaptureDraft;
  meta: ScreenshotAnalysisMeta;
  receipt: string;
};

type RelationshipWikiBlock = {
  body: string;
  citationDependencyIds: string[];
  id: string;
  kind: "action_proposal" | "fact_review" | "no_action" | "person_brief";
  status: "confirmed" | "needs_review" | "proposed";
  title: string;
};

type RelationshipWikiView = {
  blocks: RelationshipWikiBlock[];
  snapshotId: string;
};

type CapturePhase =
  | "select"
  | "analyzing"
  | "binding"
  | "review"
  | "committing";
const SCREENSHOT_ANALYSIS_SLOW_MS = 8_000;
type ResourceMode = "conversation" | "note" | "document" | "url";
type IdentityWorkflowResponse = {
  decision: IdentityResolutionDecisionResponse;
  identity_case: IdentityResolutionCase;
  compilation: KnowledgeSnapshot | null;
  compilation_error: string | null;
};

type PersonMergeWorkflowResponse = PersonMergeResponse & {
  compilations: Array<{
    relationship_context_id: string;
    person_id: string;
    status: KnowledgeSnapshot["status"] | "failed";
    knowledge_snapshot_id: string | null;
    error: string | null;
  }>;
};

const fieldLabels: Record<string, string> = {
  availability: "Availability",
  competing_process: "Competing process",
  current_employer: "Current company",
  current_role: "Current role",
  decision_deadline: "Decision deadline",
  location: "Location",
  notice_period: "Notice period",
  relocation_requirement: "Relocation requirement",
  work_mode_constraint: "Work mode constraint",
  work_mode_preference: "Work mode preference",
};

function fieldLabel(field: string) {
  if (field.startsWith("professional_history.")) {
    return "Professional history";
  }
  return fieldLabels[field] ?? field.replaceAll("_", " ");
}

function personContextSummary(person: PersonDirectoryItem) {
  if (person.contexts.length === 0) {
    return "No active relationship context";
  }

  const visibleContexts = person.contexts
    .slice(0, 2)
    .map((context) => context.display_label)
    .join(" · ");
  const remainingCount = Math.max(0, person.contexts.length - 2);
  return remainingCount > 0
    ? `${visibleContexts} · +${remainingCount} more`
    : visibleContexts;
}

function reviewLabel(status: string) {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "dismissed":
      return "Dismissed";
    case "unresolved":
      return "Needs clarification";
    default:
      return "Proposed";
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function isCompleteCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return false;
  }
  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.trim()
  );
}

function initials(value: string) {
  const segments = value.trim().split(/\s+/);
  if (segments.length === 1) {
    return value.slice(0, 2).toUpperCase();
  }
  return segments
    .map((segment) => segment[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function identityHandleLabel(type: IdentityHandleType) {
  switch (type) {
    case "email":
      return "Email";
    case "phone":
      return "Phone";
    case "wechat":
      return "WeChat";
    case "linkedin_url":
      return "LinkedIn";
    case "public_profile_url":
      return "Public profile";
    case "source_native_id":
      return "Source ID";
  }
}

function sourceKindLabel(kind: string) {
  switch (kind) {
    case "screenshot_metadata":
      return "Conversation screenshot";
    case "transcript":
      return "Reviewed conversation";
    case "fixture":
      return "Synthetic capture";
    default:
      return "Imported evidence";
  }
}

function sourceScopeLabel(scope: string) {
  switch (scope) {
    case "reviewed_extracted_text":
      return "Reviewed text only";
    case "reviewed_selected_text":
      return "Reviewed selection";
    case "reviewed_evidence_crop":
      return "Evidence crop retained";
    case "full_reviewed_source":
      return "Full source retained";
    case "legacy_unknown":
      return "Legacy scope unverified";
    default:
      return scope.replaceAll("_", " ");
  }
}

function scrollWorkspaceTo(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function uniqueWikiDependencies(
  blocks: KnowledgeSnapshot["blocks"],
): string[] {
  return [
    ...new Set(
      blocks.flatMap((block) =>
        block.dependencies.map((dependency) => dependency.id),
      ),
    ),
  ];
}

function knowledgeSnapshotWikiView(
  snapshot: KnowledgeSnapshot | null,
): RelationshipWikiView | null {
  if (!snapshot || snapshot.status !== "published") {
    return null;
  }
  const identity = snapshot.blocks.find(
    (block) => block.type === "identity_context",
  );
  if (!identity) {
    return null;
  }
  const contextBlocks = snapshot.blocks.filter(
    (block) =>
      !["identity_context", "next_action", "no_action"].includes(
        block.type,
      ),
  );
  const currentFactBlocks = contextBlocks.filter(
    (block) =>
      block.block_key.startsWith("fact.") &&
      block.status === "confirmed",
  );
  const reviewBlocks = contextBlocks.filter(
    (block) =>
      block.type === "conflict" ||
      block.type === "open_question" ||
      block.block_key.startsWith("resource.resume.") ||
      block.block_key.startsWith("resource.document.") ||
      block.block_key.startsWith("resource.contact-record."),
  );
  const nextMove = snapshot.blocks.find(
    (block) => block.type === "next_action" || block.type === "no_action",
  );
  const blocks: RelationshipWikiBlock[] = [
    {
      body:
        currentFactBlocks
          .map((block) => block.content.headline)
          .join("\n") ||
        "No additional reviewed relationship state is ready yet.",
      citationDependencyIds: uniqueWikiDependencies([
        identity,
        ...currentFactBlocks,
      ]),
      id: `${identity.id}:brief`,
      kind: "person_brief",
      status: contextBlocks.some((block) =>
        ["proposed", "contested"].includes(block.status),
      )
        ? "needs_review"
        : "confirmed",
      title: identity.content.headline,
    },
  ];
  if (reviewBlocks.length > 0) {
    const hasConflict = reviewBlocks.some(
      (block) => block.type === "conflict",
    );
    blocks.push({
      body: reviewBlocks.map((block) => block.content.headline).join("\n"),
      citationDependencyIds: uniqueWikiDependencies(reviewBlocks),
      id: `${reviewBlocks[0].id}:review`,
      kind: "fact_review",
      status: "needs_review",
      title: hasConflict
        ? "Resolve conflicting evidence before relying on it"
        : "Review proposed facts before relying on them",
    });
  }
  if (nextMove) {
    blocks.push({
      body:
        nextMove.type === "next_action"
          ? [
              nextMove.content.headline,
              nextMove.content.summary,
              ...nextMove.content.items,
            ]
              .filter(Boolean)
              .join("\n")
          : nextMove.content.headline,
      citationDependencyIds: uniqueWikiDependencies([nextMove]),
      id: `${nextMove.id}:next`,
      kind:
        nextMove.type === "next_action" ? "action_proposal" : "no_action",
      status: nextMove.type === "next_action" ? "proposed" : "confirmed",
      title: nextMove.type === "next_action" ? "Proposed next move" : "No action",
    });
  }
  return { blocks, snapshotId: snapshot.id };
}

function wikiBodyLines(body: string) {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function RelationshipWikiPanel({
  busy,
  onCompile,
  onReviewSources,
  response,
  snapshot,
}: {
  busy: boolean;
  onCompile: () => void;
  onReviewSources: () => void;
  response: ChatTaskResponse | null;
  snapshot: KnowledgeSnapshot | null;
}) {
  const view: RelationshipWikiView | null = response
    ? {
        blocks: response.blocks
          .filter((block) =>
            [
              "action_proposal",
              "fact_review",
              "no_action",
              "person_brief",
            ].includes(block.kind),
          )
          .map((block) => ({
            body: block.body,
            citationDependencyIds: block.citation_dependency_ids,
            id: block.id,
            kind: block.kind as RelationshipWikiBlock["kind"],
            status:
              block.status === "proposed"
                ? "proposed"
                : block.status === "needs_review"
                  ? "needs_review"
                  : "confirmed",
            title: block.title,
          })),
        snapshotId: response.knowledge_snapshot_id,
      }
    : knowledgeSnapshotWikiView(snapshot);
  const brief = view?.blocks.find((block) => block.kind === "person_brief");
  const review = view?.blocks.find((block) => block.kind === "fact_review");
  const nextMove = view?.blocks.find(
    (block) => block.kind === "action_proposal" || block.kind === "no_action",
  );
  const citationCount = view
    ? new Set(
        view.blocks.flatMap((block) => block.citationDependencyIds),
      ).size
    : 0;
  const briefLines = brief ? wikiBodyLines(brief.body) : [];

  return (
    <section
      aria-labelledby="relationship-wiki-title"
      className="context-relationship-wiki"
    >
      <header>
        <div>
          <p className="eyebrow">RELATIONSHIP WIKI</p>
          <h2 id="relationship-wiki-title">
            What this relationship currently supports.
          </h2>
        </div>
        {view ? (
          <span>
            <ShieldCheck aria-hidden="true" size={15} weight="duotone" />
            {citationCount} governed references
          </span>
        ) : null}
      </header>

      {view && brief ? (
        <div className="context-relationship-wiki__grid">
          <article className="context-relationship-wiki__brief">
            <div>
              <span>{brief.kind.replaceAll("_", " ")}</span>
              <i>{brief.status.replaceAll("_", " ")}</i>
            </div>
            <h3>{brief.title}</h3>
            <ul className="context-relationship-wiki__facts">
              {briefLines.map((line, index) => {
                const separator = line.indexOf(":");
                const label = separator > 0 ? line.slice(0, separator) : "";
                const value = separator > 0 ? line.slice(separator + 1).trim() : line;
                return (
                  <li key={`${line}:${index}`}>
                    {label ? <strong>{label}</strong> : null}
                    <span>{value}</span>
                  </li>
                );
              })}
            </ul>
            <footer>
              Snapshot {view.snapshotId.slice(0, 8)} · compiled
              from the current authorized source set
            </footer>
          </article>
          <aside>
            {review ? (
              <article data-state="review">
                <span>Needs judgment</span>
                <h3>{review.title}</h3>
                <p>{review.body}</p>
                <button onClick={onReviewSources} type="button">
                  Review source
                  <ArrowRight aria-hidden="true" size={14} />
                </button>
              </article>
            ) : null}
            {nextMove ? (
              <article data-state="quiet">
                <span>Next move</span>
                <h3>{nextMove.title}</h3>
                <p>{nextMove.body}</p>
              </article>
            ) : null}
          </aside>
        </div>
      ) : (
        <div className="context-relationship-wiki__empty">
          <Quotes aria-hidden="true" size={26} weight="duotone" />
          <div>
            <strong>Compile a source-linked view when you need it.</strong>
            <p>
              Confirmed facts, unresolved evidence, sources, and the smallest
              supported next move will stay visibly separate.
            </p>
          </div>
          <button
            className="context-secondary-button"
            disabled={busy}
            onClick={onCompile}
            type="button"
          >
            {busy ? (
              <CircleNotch aria-hidden="true" className="spin" size={17} />
            ) : (
              <Sparkle aria-hidden="true" size={17} weight="fill" />
            )}
            Compile Wiki
          </button>
        </div>
      )}
    </section>
  );
}

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

async function prepareConversationImage(
  source: File,
  topPercent: number,
  bottomPercent: number,
  redactions: NormalizedImageRedaction[],
): Promise<File> {
  if (
    topPercent === 0 &&
    bottomPercent === 100 &&
    redactions.length === 0
  ) {
    return source;
  }
  const bitmap = await createImageBitmap(source);
  try {
    const top = Math.round((bitmap.height * topPercent) / 100);
    const bottom = Math.round((bitmap.height * bottomPercent) / 100);
    const height = Math.max(1, bottom - top);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("The browser could not prepare the selected crop.");
    }
    context.drawImage(
      bitmap,
      0,
      top,
      bitmap.width,
      height,
      0,
      0,
      bitmap.width,
      height,
    );
    context.fillStyle = "#11100f";
    for (const redaction of redactions) {
      const pixels = redactionInPreparedImage(
        redaction,
        bitmap.width,
        bitmap.height,
        topPercent,
        bottomPercent,
      );
      if (!pixels) {
        continue;
      }
      const x = Math.floor(pixels.x);
      const y = Math.floor(pixels.y);
      const right = Math.ceil(pixels.x + pixels.width);
      const bottom = Math.ceil(pixels.y + pixels.height);
      context.fillRect(x, y, right - x, bottom - y);
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("The browser could not encode the selected crop."));
          }
        },
        source.type,
        source.type === "image/png" ? undefined : 0.92,
      );
    });
    return new File([blob], source.name, {
      lastModified: source.lastModified,
      type: blob.type || source.type,
    });
  } finally {
    bitmap.close();
  }
}

function CapturePanel({
  onClose,
  onCommitted,
}: {
  onClose: () => void;
  onCommitted: (workspace: WorkspaceReviewResponse) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const commitRequestIdRef = useRef<string | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const analysisRunRef = useRef(0);
  const committedRef = useRef(false);
  const peopleRequestIdRef = useRef(0);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [phase, setPhase] = useState<CapturePhase>("select");
  const [file, setFile] = useState<File | null>(null);
  const [analysisPreviewImage, setAnalysisPreviewImage] =
    useState<File | null>(null);
  const [cropTopPercent, setCropTopPercent] = useState(0);
  const [cropBottomPercent, setCropBottomPercent] = useState(100);
  const [redactions, setRedactions] = useState<NormalizedImageRedaction[]>([]);
  const [redactionMode, setRedactionMode] = useState(false);
  const [contactName, setContactName] = useState("");
  const [assignmentLabel, setAssignmentLabel] = useState("");
  const [screenshotOwner, setScreenshotOwner] =
    useState<ScreenshotOwnerRole>("unknown");
  const [people, setPeople] = useState<PersonDirectoryItem[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleLookupFailed, setPeopleLookupFailed] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedContextId, setSelectedContextId] = useState<string | null>(
    null,
  );
  const [createNewPerson, setCreateNewPerson] = useState(false);
  const [createNewContext, setCreateNewContext] = useState(false);
  const [analysis, setAnalysis] = useState<CaptureAnalysis | null>(null);
  const [reviewedDraft, setReviewedDraft] =
    useState<ScreenshotCaptureDraft | null>(null);
  const [transcriptEditing, setTranscriptEditing] = useState(false);
  const [error, setError] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    return () => {
      analysisRunRef.current += 1;
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    const returnTarget = returnFocusRef.current;
    return () => {
      if (committedRef.current) {
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
  }, []);

  useEffect(() => {
    const query = contactName.normalize("NFKC").trim();
    const requestId = ++peopleRequestIdRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setPeopleLoading(true);
        setPeopleLookupFailed(false);
        void fetch(
          query
            ? "/api/local-integration/people/search"
            : "/api/local-integration/people",
          query
            ? {
                method: "POST",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
                signal: controller.signal,
              }
            : { cache: "no-store", signal: controller.signal },
        )
          .then(async (response) => {
            const payload = (await response.json()) as
              | { people: PersonDirectoryItem[] }
              | { message?: string };
            if (!response.ok || !("people" in payload)) {
              throw new Error(
                "message" in payload && payload.message
                  ? payload.message
                  : "Existing people could not be loaded.",
              );
            }
            if (requestId !== peopleRequestIdRef.current) {
              return;
            }
            setPeople(payload.people);
            setPeopleLookupFailed(false);
          })
          .catch((caught: unknown) => {
            if (
              requestId !== peopleRequestIdRef.current ||
              caught instanceof DOMException &&
              caught.name === "AbortError"
            ) {
              return;
            }
            setPeople([]);
            setPeopleLookupFailed(true);
            setError(
              caught instanceof Error
                ? caught.message
                : "Existing people could not be loaded.",
            );
          })
          .finally(() => {
            if (requestId === peopleRequestIdRef.current) {
              setPeopleLoading(false);
            }
          });
      },
      query ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      if (requestId === peopleRequestIdRef.current) {
        peopleRequestIdRef.current += 1;
      }
      controller.abort();
    };
  }, [contactName]);

  const matchingPeople = people.slice(0, 4);
  const contactQueryIsHandle = parseIdentityHandleQuery(contactName) !== null;
  const selectedPerson =
    people.find((person) => person.id === selectedPersonId) ?? null;
  const selectedContext =
    selectedPerson?.contexts.find(
      (context) => context.id === selectedContextId,
    ) ?? null;
  const identityDecided =
    selectedPerson !== null ||
    (createNewPerson &&
      !peopleLoading &&
      !peopleLookupFailed &&
      !contactQueryIsHandle);
  const relationshipDecided = createNewPerson
    ? Boolean(assignmentLabel.trim())
    : Boolean(
        selectedPerson &&
          (selectedContext ||
            (createNewContext && assignmentLabel.trim())),
      );

  function chooseFile(nextFile: File | null) {
    analysisRunRef.current += 1;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    if (
      nextFile &&
      (!["image/jpeg", "image/png", "image/webp"].includes(nextFile.type) ||
        nextFile.size === 0 ||
        nextFile.size > 8 * 1024 * 1024)
    ) {
      setError("Choose one non-empty JPEG, PNG, or WebP image up to 8 MB.");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }
    setFile(nextFile);
    setAnalysisPreviewImage(null);
    setCropTopPercent(0);
    setCropBottomPercent(100);
    setRedactions([]);
    setRedactionMode(false);
    setAnalysis(null);
    setReviewedDraft(null);
    setTranscriptEditing(false);
    setPhase("select");
    setError("");
    setAnalysisStatus("");
  }

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

  function cancelAnalysis() {
    analysisRunRef.current += 1;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    setAnalysisPreviewImage(null);
    setPhase("select");
    setError("");
    setAnalysisStatus(
      "Analysis canceled. No source was saved. Your crop and local masks remain ready to retry.",
    );
  }

  async function analyze() {
    if (!file) {
      setError("Choose one conversation screenshot before starting analysis.");
      return;
    }
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    const run = analysisRunRef.current + 1;
    analysisRunRef.current = run;
    analysisAbortRef.current = controller;
    setPhase("analyzing");
    setError("");
    setAnalysisStatus(
      "Reading the transient screenshot. You can cancel; no person, source, or contact has been saved.",
    );
    const slowTimer = window.setTimeout(() => {
      if (
        analysisRunRef.current === run &&
        !controller.signal.aborted
      ) {
        setAnalysisStatus(
          "This is taking longer than usual. You can cancel; no source has been saved.",
        );
      }
    }, SCREENSHOT_ANALYSIS_SLOW_MS);
    try {
      const preparedFile = await prepareConversationImage(
        file,
        cropTopPercent,
        cropBottomPercent,
        redactions,
      );
      if (
        controller.signal.aborted ||
        analysisRunRef.current !== run
      ) {
        return;
      }
      setAnalysisPreviewImage(preparedFile === file ? null : preparedFile);
      const formData = new FormData();
      formData.set("image", preparedFile);
      formData.set("screenshotOwner", screenshotOwner);
      formData.set("cropTopPercent", String(cropTopPercent));
      formData.set("cropBottomPercent", String(cropBottomPercent));
      formData.set("redactionCount", String(redactions.length));
      const response = await fetch("/api/captures/screenshot-analysis", {
        method: "POST",
        body: formData,
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json()) as
        | CaptureAnalysis
        | { error?: string };
      if (!response.ok || !("draft" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "The screenshot could not be analyzed.",
        );
      }
      if (
        controller.signal.aborted ||
        analysisRunRef.current !== run
      ) {
        return;
      }
      setAnalysis(payload);
      setReviewedDraft(payload.draft);
      setAnalysisStatus("");
      setPhase("binding");
    } catch (caught: unknown) {
      if (
        controller.signal.aborted ||
        analysisRunRef.current !== run ||
        (caught instanceof DOMException && caught.name === "AbortError")
      ) {
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "The screenshot could not be analyzed.",
      );
      setAnalysisStatus(
        "No source was saved. Your crop and local masks remain ready to retry.",
      );
      setPhase("select");
    } finally {
      window.clearTimeout(slowTimer);
      if (analysisRunRef.current === run) {
        analysisAbortRef.current = null;
      }
    }
  }

  async function commit() {
    if (!analysis) {
      return;
    }
    if (
      !contactName.trim() ||
      !assignmentLabel.trim() ||
      !identityDecided ||
      !relationshipDecided
    ) {
      setError(
        "Bind the reviewed source to an existing person or explicitly confirm a new one before committing.",
      );
      setPhase("binding");
      return;
    }
    const draftToCommit = reviewedDraft ?? analysis.draft;
    if (draftToCommit.messages.some((message) => !message.text.trim())) {
      setError("Every reviewed message needs visible source text before commit.");
      setPhase("review");
      return;
    }
    const transcriptEdited =
      JSON.stringify(draftToCommit.messages) !==
      JSON.stringify(analysis.draft.messages);
    setPhase("committing");
    setError("");
    try {
      commitRequestIdRef.current ??= crypto.randomUUID();
      const response = await fetch("/api/local-integration/captures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request_id: commitRequestIdRef.current,
          person_id: selectedPersonId,
          relationship_context_id: selectedContextId,
          contact_name: contactName.trim(),
          assignment_label: assignmentLabel.trim(),
          draft: draftToCommit,
          ...(transcriptEdited
            ? { original_draft: analysis.draft }
            : {}),
          analysis_meta: analysis.meta,
          analysis_receipt: analysis.receipt,
        }),
      });
      const payload = (await response.json()) as
        | WorkspaceReviewResponse
        | { code?: string; message?: string };
      if (!response.ok || !("capture" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The reviewed capture could not be committed.",
        );
      }
      committedRef.current = true;
      onCommitted(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The reviewed capture could not be committed.",
      );
      setPhase("review");
    }
  }

  const draft = reviewedDraft ?? analysis?.draft ?? null;
  const reviewImage = analysisPreviewImage ?? file;
  const transcriptEdited = Boolean(
    analysis &&
      draft &&
      JSON.stringify(draft.messages) !==
        JSON.stringify(analysis.draft.messages),
  );

  function updateReviewedMessage(
    messageId: string,
    change: { speaker?: "candidate" | "recruiter" | "unknown"; text?: string },
  ) {
    setReviewedDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        messages: current.messages.map((message) =>
          message.source_message_id === messageId
            ? { ...message, ...change }
            : message,
        ),
        assertions: [],
        disposition: "no_action",
        action: null,
      };
    });
  }

  function adjustLatestRedaction(
    direction: "down" | "left" | "right" | "up",
    resize: boolean,
  ) {
    setRedactions((current) => {
      const latest = current.at(-1);
      if (!latest) {
        return current;
      }
      const step = 0.01;
      const next = { ...latest };
      if (resize) {
        if (direction === "left") {
          next.width = Math.max(0.008, next.width - step);
        } else if (direction === "right") {
          next.width = Math.min(1 - next.x, next.width + step);
        } else if (direction === "up") {
          next.height = Math.max(0.008, next.height - step);
        } else {
          next.height = Math.min(1 - next.y, next.height + step);
        }
      } else if (direction === "left") {
        next.x = Math.max(0, next.x - step);
      } else if (direction === "right") {
        next.x = Math.min(1 - next.width, next.x + step);
      } else if (direction === "up") {
        next.y = Math.max(0, next.y - step);
      } else {
        next.y = Math.min(1 - next.height, next.y + step);
      }
      return [...current.slice(0, -1), next];
    });
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
                  onChange={(event) => {
                    setPeopleLoading(true);
                    setPeopleLookupFailed(false);
                    setContactName(event.target.value);
                    setSelectedPersonId(null);
                    setSelectedContextId(null);
                    setCreateNewPerson(false);
                    setCreateNewContext(false);
                    setAssignmentLabel("");
                  }}
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
                      onClick={() => {
                        setSelectedPersonId(null);
                        setSelectedContextId(null);
                        setCreateNewContext(false);
                        setAssignmentLabel("");
                      }}
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
                      onClick={() => setCreateNewPerson(false)}
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
                            onClick={() => {
                              setContactName(person.display_label);
                              setSelectedPersonId(person.id);
                              setSelectedContextId(null);
                              setCreateNewPerson(false);
                              setCreateNewContext(false);
                              setAssignmentLabel("");
                            }}
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
                        onClick={() => {
                          setSelectedPersonId(null);
                          setSelectedContextId(null);
                          setCreateNewPerson(true);
                          setCreateNewContext(false);
                          setAssignmentLabel("");
                        }}
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
                      onClick={() => {
                        setSelectedContextId(context.id);
                        setAssignmentLabel(context.display_label);
                        setCreateNewContext(false);
                      }}
                      type="button"
                    >
                      {context.display_label}
                    </button>
                  ))}
                  <button
                    data-selected={createNewContext}
                    onClick={() => {
                      setSelectedContextId(null);
                      setCreateNewContext(true);
                      setAssignmentLabel("");
                    }}
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
                      onAdd={(redaction) =>
                        setRedactions((current) => [...current, redaction])
                      }
                      onKeyboardAdjust={adjustLatestRedaction}
                      onKeyboardUndo={() =>
                        setRedactions((current) => current.slice(0, -1))
                      }
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
                        onClick={() => setRedactionMode((current) => !current)}
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
                            onClick={() =>
                              setRedactions((current) => current.slice(0, -1))
                            }
                            type="button"
                          >
                            Undo
                          </button>
                          <button
                            disabled={phase !== "select"}
                            onClick={() => setRedactions([])}
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
                    setPhase("select");
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
                    setError("");
                    setPhase("review");
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
                            if (analysis) {
                              setReviewedDraft(analysis.draft);
                            }
                            setTranscriptEditing(false);
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
                  setPhase("binding");
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

function ConversationTranscriptComposer({
  title,
  value,
  messages,
  attributionReviewed,
  onTitleChange,
  onValueChange,
  onMessagesChange,
  onAttributionReviewedChange,
}: {
  title: string;
  value: string;
  messages: ConversationTranscriptMessage[];
  attributionReviewed: boolean;
  onTitleChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onMessagesChange: (messages: ConversationTranscriptMessage[]) => void;
  onAttributionReviewedChange: (reviewed: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [unlabeledSpeaker, setUnlabeledSpeaker] =
    useState<ConversationSpeaker>("unknown");
  const [fileName, setFileName] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analysisSummary, setAnalysisSummary] = useState<{
    labeled: number;
    unknown: number;
  } | null>(null);

  function invalidateAnalysis() {
    onMessagesChange([]);
    onAttributionReviewedChange(false);
    setAnalysisSummary(null);
    setAnalysisError("");
  }

  function analyzeTranscript() {
    try {
      const analysis = parseConversationTranscript(value, unlabeledSpeaker);
      onMessagesChange(analysis.messages);
      onAttributionReviewedChange(false);
      setAnalysisSummary({
        labeled: analysis.explicitly_labeled_count,
        unknown: analysis.unknown_count,
      });
      setAnalysisError("");
    } catch (caught) {
      onMessagesChange([]);
      onAttributionReviewedChange(false);
      setAnalysisSummary(null);
      setAnalysisError(
        caught instanceof Error
          ? caught.message
          : "The transcript could not be analyzed.",
      );
    }
  }

  async function readTextFile(nextFile: File | null) {
    if (!nextFile) {
      return;
    }
    if (nextFile.size <= 0 || nextFile.size > 256 * 1024) {
      setAnalysisError("Choose one non-empty TXT or Markdown file up to 256 KB.");
      return;
    }
    try {
      const text = await nextFile.text();
      setFileName(nextFile.name);
      onTitleChange(title.trim() ? title : nextFile.name);
      onValueChange(text);
      onMessagesChange([]);
      onAttributionReviewedChange(false);
      setAnalysisSummary(null);
      setAnalysisError("");
    } catch {
      setAnalysisError("The selected text file could not be read in the browser.");
    }
  }

  function updateSpeaker(sequence: number, speaker: ConversationSpeaker) {
    onMessagesChange(
      messages.map((message) =>
        message.sequence === sequence ? { ...message, speaker } : message,
      ),
    );
    onAttributionReviewedChange(false);
  }

  return (
    <div className="context-transcript-import">
      <div className="context-transcript-import__source">
        <label>
          <span>Conversation label</span>
          <input
            maxLength={240}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="e.g. Aug 9 follow-up transcript"
            value={title}
          />
        </label>
        <input
          accept=".txt,.md,text/plain,text/markdown"
          className="sr-only"
          onChange={(event) => void readTextFile(event.target.files?.[0] ?? null)}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="context-resource-file context-resource-file--transcript"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <ChatCircleDots aria-hidden="true" size={20} />
          <span>
            <strong>{fileName || "Choose TXT or Markdown"}</strong>
            <small>Read locally, then review the exact text below.</small>
          </span>
        </button>
        <label>
          <span>Conversation text</span>
          <textarea
            maxLength={40_000}
            onChange={(event) => {
              onValueChange(event.target.value);
              invalidateAnalysis();
            }}
            placeholder={
              "Candidate: Availability: 15 September\nRecruiter: I’ll confirm the interview window."
            }
            rows={6}
            value={value}
          />
        </label>
      </div>

      <div className="context-transcript-import__analysis">
        <fieldset>
          <legend>Unlabeled lines belong to</legend>
          <div>
            {CONVERSATION_SPEAKERS.map((speaker) => (
              <button
                aria-pressed={unlabeledSpeaker === speaker}
                key={speaker}
                onClick={() => {
                  setUnlabeledSpeaker(speaker);
                  invalidateAnalysis();
                }}
                type="button"
              >
                {speaker === "unknown"
                  ? "Not sure"
                  : speaker === "candidate"
                    ? "Candidate"
                    : "Recruiter"}
              </button>
            ))}
          </div>
          <small>
            Choose Candidate only for a candidate-only export. Talent Signal
            never guesses a speaker from wording or message order.
          </small>
        </fieldset>
        <button
          className="context-secondary-button"
          disabled={!value.trim()}
          onClick={analyzeTranscript}
          type="button"
        >
          <Sparkle aria-hidden="true" size={17} weight="fill" />
          Analyze speaker labels
        </button>
      </div>

      {analysisError ? (
        <p className="context-resource-composer__error" role="alert">
          <Warning aria-hidden="true" size={16} />
          {analysisError}
        </p>
      ) : null}

      {messages.length > 0 ? (
        <section
          aria-labelledby="transcript-review-title"
          className="context-transcript-import__review"
        >
          <header>
            <div>
              <p className="eyebrow">SPEAKER REVIEW</p>
              <h3 id="transcript-review-title">Review every message owner.</h3>
            </div>
            <span>
              {messages.length} messages · {analysisSummary?.labeled ?? 0} labeled
              {analysisSummary?.unknown
                ? ` · ${analysisSummary.unknown} unknown`
                : ""}
            </span>
          </header>
          <div className="context-transcript-import__messages">
            {messages.map((message) => (
              <div data-speaker={message.speaker} key={message.sequence}>
                <select
                  aria-label={`Speaker for transcript message ${message.sequence + 1}`}
                  onChange={(event) =>
                    updateSpeaker(
                      message.sequence,
                      event.target.value as ConversationSpeaker,
                    )
                  }
                  value={message.speaker}
                >
                  <option value="candidate">Candidate</option>
                  <option value="recruiter">Recruiter</option>
                  <option value="unknown">Not sure</option>
                </select>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <label className="context-resource-checkbox context-transcript-import__confirm">
            <input
              checked={attributionReviewed}
              onChange={(event) =>
                onAttributionReviewedChange(event.target.checked)
              }
              type="checkbox"
            />
            <span>
              I reviewed the speaker labels above
              <small>
                Unknown messages remain context only and cannot create candidate
                facts. Every fact still requires separate review.
              </small>
            </span>
          </label>
        </section>
      ) : null}
    </div>
  );
}

function StartRelationshipPanel({
  onCommitted,
  onScreenshot,
}: {
  onCommitted: (
    scope: RelationshipScope,
    receipts: ResourceCaptureResponse[],
    outcome:
      | "created_person"
      | "created_relationship_context"
      | "reused_relationship",
  ) => void;
  onScreenshot: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const requestCapturedAtRef = useRef<string | null>(null);
  const peopleRequestIdRef = useRef(0);
  const [people, setPeople] = useState<PersonDirectoryItem[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleLookupFailed, setPeopleLookupFailed] = useState(false);
  const [mode, setMode] = useState<ResourceMode>("note");
  const [contactName, setContactName] = useState("");
  const [contextLabel, setContextLabel] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(
    null,
  );
  const [selectedContextId, setSelectedContextId] = useState<string | null>(
    null,
  );
  const [createNewPerson, setCreateNewPerson] = useState(false);
  const [createNewContext, setCreateNewContext] = useState(false);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [transcriptMessages, setTranscriptMessages] = useState<
    ConversationTranscriptMessage[]
  >([]);
  const [transcriptAttributionReviewed, setTranscriptAttributionReviewed] =
    useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentKind, setDocumentKind] = useState<
    "resume" | "document"
  >("resume");
  const [saveDiscoveredLinks, setSaveDiscoveredLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = contactName.normalize("NFKC").trim();
    const requestId = ++peopleRequestIdRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setPeopleLoading(true);
        setPeopleLookupFailed(false);
        void fetch(
          query
            ? "/api/local-integration/people/search"
            : "/api/local-integration/people",
          query
            ? {
                method: "POST",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
                signal: controller.signal,
              }
            : { cache: "no-store", signal: controller.signal },
        )
          .then(async (response) => {
            const payload = (await response.json()) as
              | { people: PersonDirectoryItem[] }
              | { message?: string };
            if (!response.ok || !("people" in payload)) {
              throw new Error(
                "message" in payload && payload.message
                  ? payload.message
                  : "Existing people could not be loaded.",
              );
            }
            if (requestId !== peopleRequestIdRef.current) {
              return;
            }
            setPeople(payload.people);
            setPeopleLookupFailed(false);
          })
          .catch((caught: unknown) => {
            if (
              requestId !== peopleRequestIdRef.current ||
              caught instanceof DOMException &&
              caught.name === "AbortError"
            ) {
              return;
            }
            setPeople([]);
            setPeopleLookupFailed(true);
            setError(
              caught instanceof Error
                ? caught.message
                : "Existing people could not be loaded.",
            );
          })
          .finally(() => {
            if (requestId === peopleRequestIdRef.current) {
              setPeopleLoading(false);
            }
          });
      },
      query ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      if (requestId === peopleRequestIdRef.current) {
        peopleRequestIdRef.current += 1;
      }
      controller.abort();
    };
  }, [contactName]);

  const selectedPerson =
    people.find((person) => person.id === selectedPersonId) ?? null;
  const selectedContext =
    selectedPerson?.contexts.find(
      (context) => context.id === selectedContextId,
    ) ?? null;
  const matchingPeople = people.slice(0, 4);
  const contactQueryIsHandle = parseIdentityHandleQuery(contactName) !== null;
  const identityReady =
    (createNewPerson &&
      !peopleLoading &&
      !peopleLookupFailed &&
      !contactQueryIsHandle &&
      contactName.trim() &&
      contextLabel.trim()) ||
    (selectedPerson &&
      (selectedContext || (createNewContext && contextLabel.trim())));
  const sourceReady =
    mode === "document"
      ? file !== null
      : mode === "conversation"
        ? transcriptMessages.length > 0 && transcriptAttributionReviewed
        : value.trim().length > 0;

  function resetRequest() {
    requestIdRef.current = null;
    requestCapturedAtRef.current = null;
    setError("");
  }

  async function submit() {
    if (!identityReady || !sourceReady) {
      setError(
        "Choose an existing person and context, or explicitly create a new person, then add one source.",
      );
      return;
    }
    if (!requestIdRef.current) {
      requestIdRef.current = crypto.randomUUID();
      requestCapturedAtRef.current = new Date().toISOString();
    }
    const requestId = requestIdRef.current;
    const capturedAt = requestCapturedAtRef.current;
    if (!capturedAt) {
      setError("The source observation time could not be preserved.");
      return;
    }
    const scopeMode = createNewPerson
      ? "new_person"
      : createNewContext
        ? "existing_person_new_context"
        : "existing";
    setBusy(true);
    setError("");
    try {
      let response: Response;
      if (mode === "document" && file) {
        const form = new FormData();
        form.set("request_id", requestId);
        form.set("captured_at", capturedAt);
        form.set("scope_mode", scopeMode);
        form.set("contact_name", contactName.trim());
        form.set("relationship_context_label", contextLabel.trim());
        if (selectedPersonId) {
          form.set("person_id", selectedPersonId);
        }
        if (selectedContextId) {
          form.set("relationship_context_id", selectedContextId);
        }
        form.set("document_kind", documentKind);
        form.set(
          "save_discovered_links",
          saveDiscoveredLinks ? "true" : "false",
        );
        form.set("file", file);
        response = await fetch("/api/local-integration/resources", {
          method: "POST",
          body: form,
          cache: "no-store",
        });
      } else {
        response = await fetch("/api/local-integration/resources", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId,
            captured_at: capturedAt,
            scope_mode: scopeMode,
            contact_name: contactName.trim(),
            relationship_context_label: contextLabel.trim(),
            person_id: selectedPersonId ?? undefined,
            relationship_context_id: selectedContextId ?? undefined,
            type: mode,
            title: title.trim() || undefined,
            value: value.trim(),
            ...(mode === "conversation"
              ? {
                  transcript_messages: transcriptMessages,
                  attribution_reviewed: transcriptAttributionReviewed,
                }
              : {}),
          }),
        });
      }
      const payload = (await response.json()) as
        | { receipts: ResourceCaptureResponse[] }
        | { message?: string };
      if (!response.ok || !("receipts" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The first source could not be committed.",
        );
      }
      const first = payload.receipts[0];
      const personId = first?.identity.person_id;
      const relationshipContextId =
        first?.identity.relationship_context_id;
      if (!first || !personId || !relationshipContextId) {
        throw new Error(
          "The first source is waiting for identity review and cannot open a person page yet.",
        );
      }
      onCommitted(
        {
          contract_version: first.contract_version,
          person: {
            id: personId,
            display_label:
              selectedPerson?.display_label ?? contactName.trim(),
          },
          relationship_context: {
            id: relationshipContextId,
            display_label:
              selectedContext?.display_label ?? contextLabel.trim(),
          },
        },
        payload.receipts,
        !selectedPerson
          ? "created_person"
          : selectedContext
            ? "reused_relationship"
            : "created_relationship_context",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The first source could not be committed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="context-start">
      <div className="context-start__intro">
        <p className="eyebrow">FIRST GOVERNED SOURCE</p>
        <h2>Choose the person, relationship, and source.</h2>
        <p>
          Identity is your decision. Extraction and source claims remain
          separate review states.
        </p>
      </div>

      <div className="context-start__identity">
        <label>
          <span>Person</span>
          <input
            autoComplete="off"
            maxLength={200}
            onChange={(event) => {
              setPeopleLoading(true);
              setPeopleLookupFailed(false);
              setContactName(event.target.value);
              setSelectedPersonId(null);
              setSelectedContextId(null);
              setCreateNewPerson(false);
              setCreateNewContext(false);
              resetRequest();
            }}
            placeholder="Search or name a person"
            value={contactName}
          />
        </label>
        <div className="context-start__choices">
          {peopleLoading ? (
            <span>Loading people…</span>
          ) : (
            matchingPeople.map((person) => (
              <button
                data-selected={selectedPersonId === person.id}
                key={person.id}
                onClick={() => {
                  setSelectedPersonId(person.id);
                  setContactName(person.display_label);
                  setCreateNewPerson(false);
                  setCreateNewContext(false);
                  setSelectedContextId(null);
                  setContextLabel("");
                  resetRequest();
                }}
                type="button"
              >
                <span>{initials(person.display_label)}</span>
                <p>
                  <strong>{person.display_label}</strong>
                  <small>
                    {personContextSummary(person)} · {person.capture_count}{" "}
                    {person.capture_count === 1 ? "source" : "sources"}
                  </small>
                </p>
              </button>
            ))
          )}
          {!peopleLoading &&
          !peopleLookupFailed &&
          contactName.trim() &&
          !contactQueryIsHandle ? (
            <button
              data-selected={createNewPerson}
              onClick={() => {
                setCreateNewPerson(true);
                setSelectedPersonId(null);
                setSelectedContextId(null);
                setCreateNewContext(false);
                resetRequest();
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={17} />
              <p>
                <strong>Create “{contactName.trim()}”</strong>
                <small>This is an explicit new-person decision.</small>
              </p>
            </button>
          ) : null}
        </div>
        {contactQueryIsHandle &&
        matchingPeople.length === 0 &&
        !peopleLoading &&
        !peopleLookupFailed ? (
          <p className="context-start__lookup-note">
            No current or historical owner matched this masked identity clue.
            Enter the person&apos;s name before creating a new identity.
          </p>
        ) : null}

        {selectedPerson ? (
          <div className="context-start__contexts">
            <span>Choose the relationship context</span>
            {selectedPerson.contexts.map((context) => (
              <button
                data-selected={selectedContextId === context.id}
                key={context.id}
                onClick={() => {
                  setSelectedContextId(context.id);
                  setContextLabel(context.display_label);
                  setCreateNewContext(false);
                  resetRequest();
                }}
                type="button"
              >
                {context.display_label}
              </button>
            ))}
            <button
              data-selected={createNewContext}
              onClick={() => {
                setSelectedContextId(null);
                setCreateNewContext(true);
                setContextLabel("");
                resetRequest();
              }}
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
              maxLength={200}
              onChange={(event) => {
                setContextLabel(event.target.value);
                resetRequest();
              }}
              placeholder="e.g. VP Product · Northstar search"
              value={contextLabel}
            />
          </label>
        ) : null}
      </div>

      <div className="context-start__source">
        <div aria-label="First source type" role="tablist">
          {(["note", "conversation", "document", "url"] as const).map((sourceMode) => (
            <button
              aria-selected={mode === sourceMode}
              key={sourceMode}
              onClick={() => {
                setMode(sourceMode);
                resetRequest();
              }}
              role="tab"
              type="button"
            >
              {sourceMode === "note" ? (
                <PencilSimple aria-hidden="true" size={16} />
              ) : sourceMode === "conversation" ? (
                <ChatCircleDots aria-hidden="true" size={16} />
              ) : sourceMode === "document" ? (
                <UploadSimple aria-hidden="true" size={16} />
              ) : (
                <LinkSimple aria-hidden="true" size={16} />
              )}
              {sourceMode === "document"
                ? "File"
                : sourceMode === "conversation"
                  ? "Transcript"
                  : sourceMode}
            </button>
          ))}
          <button onClick={onScreenshot} type="button">
            <FileImage aria-hidden="true" size={16} />
            Screenshot
          </button>
        </div>

        {mode === "conversation" ? (
          <ConversationTranscriptComposer
            attributionReviewed={transcriptAttributionReviewed}
            messages={transcriptMessages}
            onAttributionReviewedChange={(reviewed) => {
              setTranscriptAttributionReviewed(reviewed);
              resetRequest();
            }}
            onMessagesChange={(messages) => {
              setTranscriptMessages(messages);
              resetRequest();
            }}
            onTitleChange={(nextTitle) => {
              setTitle(nextTitle);
              resetRequest();
            }}
            onValueChange={(nextValue) => {
              setValue(nextValue);
              resetRequest();
            }}
            title={title}
            value={value}
          />
        ) : mode === "document" ? (
          <div className="context-resource-composer__document">
            <input
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              className="sr-only"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                resetRequest();
              }}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="context-resource-file"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <UploadSimple aria-hidden="true" size={20} />
              <span>
                <strong>{file?.name ?? "Choose resume or document"}</strong>
                <small>Raw file is parsed transiently and not retained.</small>
              </span>
            </button>
            <label>
              <span>Document meaning</span>
              <select
                onChange={(event) =>
                  setDocumentKind(
                    event.target.value as "resume" | "document",
                  )
                }
                value={documentKind}
              >
                <option value="resume">Resume</option>
                <option value="document">Supporting document</option>
              </select>
            </label>
            <label className="context-resource-checkbox">
              <input
                checked={saveDiscoveredLinks}
                onChange={(event) =>
                  setSaveDiscoveredLinks(event.target.checked)
                }
                type="checkbox"
              />
              <span>
                Save visible URLs as research seeds
                <small>No page is fetched and no research is authorized.</small>
              </span>
            </label>
          </div>
        ) : (
          <div className="context-resource-composer__text">
            <label>
              <span>{mode === "note" ? "Note title" : "Link label"}</span>
              <input
                maxLength={240}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  mode === "note"
                    ? "e.g. First-call context"
                    : "e.g. Public profile"
                }
                value={title}
              />
            </label>
            <label>
              <span>{mode === "note" ? "Your note" : "Public URL"}</span>
              {mode === "note" ? (
                <textarea
                  maxLength={40_000}
                  onChange={(event) => {
                    setValue(event.target.value);
                    resetRequest();
                  }}
                  rows={4}
                  value={value}
                />
              ) : (
                <input
                  maxLength={2_000}
                  onChange={(event) => {
                    setValue(event.target.value);
                    resetRequest();
                  }}
                  placeholder="https://"
                  type="url"
                  value={value}
                />
              )}
            </label>
          </div>
        )}
      </div>

      {error ? (
        <p className="context-resource-composer__error" role="alert">
          <Warning aria-hidden="true" size={16} />
          {error}
        </p>
      ) : null}
      <footer>
        <p>
          The source stays separate from confirmed facts. Files remain
          proposed until you review the extraction.
        </p>
        <button
          className="context-primary-button"
          disabled={busy || !identityReady || !sourceReady}
          onClick={() => void submit()}
          type="button"
        >
          {busy ? (
            <CircleNotch aria-hidden="true" className="spin" size={17} />
          ) : (
            <ArrowRight aria-hidden="true" size={17} />
          )}
          {busy ? "Creating person page" : "Open living person page"}
        </button>
      </footer>
    </section>
  );
}

function RelationshipResourceComposer({
  personId,
  relationshipContextId,
  scopeLabel,
  onCommitted,
  onEvidenceChanged,
  onScreenshot,
}: {
  personId: string;
  relationshipContextId: string;
  scopeLabel: string;
  onCommitted: (receipts: ResourceCaptureResponse[]) => void;
  onEvidenceChanged: (
    announcement?: string,
    relationshipRemoved?: boolean,
  ) => void | Promise<void>;
  onScreenshot: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const requestCapturedAtRef = useRef<string | null>(null);
  const [mode, setMode] = useState<ResourceMode>("note");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [transcriptMessages, setTranscriptMessages] = useState<
    ConversationTranscriptMessage[]
  >([]);
  const [transcriptAttributionReviewed, setTranscriptAttributionReviewed] =
    useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentKind, setDocumentKind] = useState<
    "resume" | "document"
  >("resume");
  const [saveDiscoveredLinks, setSaveDiscoveredLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    resources: number;
    linksFound: number;
    warnings: number;
  } | null>(null);
  const [resources, setResources] = useState<
    RelationshipResourceListItem[]
  >([]);
  const [selectedResource, setSelectedResource] =
    useState<RelationshipResourceDetail | null>(null);
  const [claimEdits, setClaimEdits] = useState<Record<string, string>>({});
  const [resourceLoading, setResourceLoading] = useState(true);
  const [deleteResourceConfirm, setDeleteResourceConfirm] =
    useState(false);
  const [researchApproval, setResearchApproval] = useState(false);
  const [researchPageCount, setResearchPageCount] = useState(1);
  const [researchLinkDepth, setResearchLinkDepth] = useState(0);
  const [researchResult, setResearchResult] =
    useState<PublicResearchResponse | null>(null);
  const identityCorrectionRequestRef = useRef<string | null>(null);
  const [identityCorrectionOpen, setIdentityCorrectionOpen] =
    useState(false);
  const [identityPeople, setIdentityPeople] = useState<
    PersonDirectoryItem[]
  >([]);
  const [identityPeopleLoading, setIdentityPeopleLoading] =
    useState(false);
  const [identityTargetMode, setIdentityTargetMode] = useState<
    "existing" | "new"
  >("existing");
  const [identityTargetPersonId, setIdentityTargetPersonId] =
    useState("");
  const [identityTargetContextId, setIdentityTargetContextId] =
    useState("");
  const [identityNewPersonLabel, setIdentityNewPersonLabel] =
    useState("");
  const [identityNewContextLabel, setIdentityNewContextLabel] =
    useState("");
  const [identityCorrectionReason, setIdentityCorrectionReason] =
    useState("");
  const sourceAuthorizationRequestRef = useRef<string | null>(null);
  const [sourceAuthorizationOpen, setSourceAuthorizationOpen] =
    useState(false);
  const [sourceAuthorizationReason, setSourceAuthorizationReason] =
    useState("");
  const [
    sourceAuthorizationExpiresAt,
    setSourceAuthorizationExpiresAt,
  ] = useState("");

  const identityTargetPerson =
    identityPeople.find(
      (person) => person.id === identityTargetPersonId,
    ) ?? null;

  function resetIdentityCorrectionRequest() {
    identityCorrectionRequestRef.current = null;
  }

  function resetSourceAuthorizationDecision() {
    sourceAuthorizationRequestRef.current = null;
    setSourceAuthorizationReason("");
    setSourceAuthorizationExpiresAt("");
  }

  async function beginIdentityCorrection() {
    setDeleteResourceConfirm(false);
    setSourceAuthorizationOpen(false);
    resetSourceAuthorizationDecision();
    setIdentityCorrectionOpen(true);
    setIdentityPeopleLoading(true);
    setError("");
    try {
      const response = await fetch("/api/local-integration/people", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | { people: PersonDirectoryItem[] }
        | { message?: string };
      if (!response.ok || !("people" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "Existing people could not be loaded.",
        );
      }
      const alternatives = payload.people.filter(
        (person) => person.id !== personId,
      );
      setIdentityPeople(alternatives);
      setIdentityTargetPersonId("");
      setIdentityTargetContextId("");
      setIdentityTargetMode(
        alternatives.length > 0 ? "existing" : "new",
      );
      resetIdentityCorrectionRequest();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Existing people could not be loaded.",
      );
    } finally {
      setIdentityPeopleLoading(false);
    }
  }

  async function correctSelectedResourceIdentity() {
    if (!selectedResource || !identityCorrectionReason.trim()) {
      return;
    }
    const existingContext =
      identityTargetMode === "existing" &&
      identityTargetPerson?.contexts.find(
        (context) => context.id === identityTargetContextId,
      );
    const createsContext =
      identityTargetMode === "existing" &&
      identityTargetContextId === "__new__";
    const target =
      identityTargetMode === "existing" && identityTargetPerson
        ? {
            status: "existing_person" as const,
            person_id: identityTargetPerson.id,
            relationship_context: existingContext
              ? {
                  status: "existing" as const,
                  relationship_context_id: existingContext.id,
                }
              : {
                  status: "proposed" as const,
                  label: identityNewContextLabel.trim(),
                  purpose:
                    "Correct a governed source into the recruiter-selected relationship context",
                },
          }
        : {
            status: "new_person" as const,
            display_label: identityNewPersonLabel.trim(),
            relationship_context: {
              status: "proposed" as const,
              label: identityNewContextLabel.trim(),
              purpose:
                "Correct a governed source into a newly created person and relationship context",
            },
          };
    const targetReady =
      target.status === "existing_person"
        ? Boolean(
            identityTargetPerson &&
              (existingContext ||
                (createsContext && identityNewContextLabel.trim())),
          )
        : Boolean(
            identityNewPersonLabel.trim() &&
              identityNewContextLabel.trim(),
          );
    if (!targetReady) {
      return;
    }

    setBusy(true);
    setError("");
    identityCorrectionRequestRef.current ??= crypto.randomUUID();
    try {
      const response = await fetch(
        `/api/local-integration/captures/${selectedResource.resource.capture_id}/identity-corrections`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: identityCorrectionRequestRef.current,
            expected_capture_version:
              selectedResource.resource.capture_version,
            expected_person_id: personId,
            expected_relationship_context_id:
              relationshipContextId,
            reason: identityCorrectionReason.trim(),
            binding_basis:
              "The recruiter inspected this governed source and explicitly selected the corrected person and relationship context.",
            target,
          }),
        },
      );
      const payload = (await response.json()) as
        | {
            capture_ids_rebound: string[];
            claims_reopened: number;
            person_id: string;
            relationship_context_id: string;
          }
        | { message?: string };
      if (!response.ok || !("person_id" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The source identity could not be corrected.",
        );
      }
      onEvidenceChanged();
      setSelectedResource(null);
      setIdentityCorrectionOpen(false);
      await loadResources();
      window.location.assign(
        `/workspace?person=${encodeURIComponent(
          payload.person_id,
        )}&context=${encodeURIComponent(
          payload.relationship_context_id,
        )}&identity_corrected=${encodeURIComponent(
          String(payload.capture_ids_rebound.length),
        )}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The source identity could not be corrected.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadResources() {
    setResourceLoading(true);
    try {
      const query = new URLSearchParams({
        person_id: personId,
        relationship_context_id: relationshipContextId,
      });
      const response = await fetch(
        `/api/local-integration/resources?${query}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | { resources: RelationshipResourceListItem[] }
        | { message?: string };
      if (!response.ok || !("resources" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "Relationship resources could not be loaded.",
        );
      }
      setResources(payload.resources);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Relationship resources could not be loaded.",
      );
    } finally {
      setResourceLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      person_id: personId,
      relationship_context_id: relationshipContextId,
    });
    void fetch(`/api/local-integration/resources?${query}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as
          | { resources: RelationshipResourceListItem[] }
          | { message?: string };
        if (!response.ok || !("resources" in payload)) {
          throw new Error(
            "message" in payload && payload.message
              ? payload.message
              : "Relationship resources could not be loaded.",
          );
        }
        if (active) {
          setResources(payload.resources);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Relationship resources could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setResourceLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [personId, relationshipContextId]);

  async function openResource(resourceId: string) {
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/resources?resource_id=${encodeURIComponent(
          resourceId,
        )}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | RelationshipResourceDetail
        | { message?: string };
      if (!response.ok || !("fragments" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The source evidence could not be opened.",
        );
      }
      setSelectedResource(payload);
      setClaimEdits(
        Object.fromEntries(
          payload.claim_proposals.map((claim) => [
            claim.id,
            claim.proposed_value ?? "",
          ]),
        ),
      );
      setResearchApproval(false);
      setResearchResult(null);
      setIdentityCorrectionOpen(false);
      setIdentityCorrectionReason("");
      resetIdentityCorrectionRequest();
      setSourceAuthorizationOpen(false);
      resetSourceAuthorizationDecision();
      if (
        payload.resource.kind === "public_url" &&
        payload.resource.input_channel !== "api_connector" &&
        payload.resource.source_locator
      ) {
        try {
          await refreshResearchStatus(payload.resource.id);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "The source opened, but its prior research status could not be restored.",
          );
        }
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The source evidence could not be opened.",
      );
    }
  }

  async function loadLatestResearch(
    seedResourceId: string,
  ): Promise<PublicResearchResponse | null> {
    const query = new URLSearchParams({
      seed_resource_id: seedResourceId,
    });
    const response = await fetch(
      `/api/local-integration/research?${query}`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as
      | PublicResearchResponse
      | null
      | { message?: string };
    if (!response.ok) {
      throw new Error(
        payload &&
          "message" in payload &&
          typeof payload.message === "string"
          ? payload.message
          : "The prior public research status could not be restored.",
      );
    }
    if (payload === null || "task_id" in payload) {
      return payload;
    }
    throw new Error(
      "The prior public research status could not be restored.",
    );
  }

  async function refreshResearchStatus(seedResourceId?: string) {
    const resourceId =
      seedResourceId ?? selectedResource?.resource.id;
    if (!resourceId) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      setResearchResult(await loadLatestResearch(resourceId));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The prior public research status could not be restored.",
      );
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function researchSelectedResource() {
    if (
      !selectedResource ||
      selectedResource.resource.kind !== "public_url" ||
      !selectedResource.resource.source_locator
    ) {
      return;
    }
    let domain: string;
    try {
      domain = new URL(
        selectedResource.resource.source_locator,
      ).hostname.toLowerCase();
    } catch {
      setError("The saved public URL is invalid.");
      return;
    }
    setBusy(true);
    setError("");
    setResearchResult(null);
    try {
      const response = await fetch("/api/local-integration/research", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          person_id: personId,
          relationship_context_id: relationshipContextId,
          seed_resource_id: selectedResource.resource.id,
          expected_seed_url:
            selectedResource.resource.source_locator,
          allowed_domain: domain,
          maximum_page_count: researchPageCount,
          maximum_link_depth: researchLinkDepth,
        }),
      });
      const payload = (await response.json()) as
        | PublicResearchResponse
        | { message?: string };
      if (!response.ok || !("task_id" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The bounded public research could not be completed.",
        );
      }
      setResearchResult(payload);
      setResearchApproval(false);
      await loadResources();
      onEvidenceChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The bounded public research could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideFragment(
    fragmentId: string,
    currentStatus: "proposed" | "reviewed" | "rejected",
    decision: "reviewed" | "rejected",
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/evidence-fragments/${fragmentId}/reviews`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            expected_review_status: currentStatus,
            decision,
            reason:
              decision === "reviewed"
                ? "The recruiter compared this extraction with the visible source."
                : "The recruiter rejected this extraction as unreliable.",
          }),
        },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(
          payload.message ?? "The evidence review could not be saved.",
        );
      }
      if (selectedResource) {
        await openResource(selectedResource.resource.id);
      }
      await loadResources();
      onEvidenceChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The evidence review could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideClaim(
    claim: RelationshipResourceDetail["claim_proposals"][number],
    decision: "confirm" | "dismiss" | "leave_unresolved",
  ) {
    if (!selectedResource) {
      return;
    }
    const correctedValue = claimEdits[claim.id]?.trim() ?? "";
    if (decision === "confirm" && !correctedValue) {
      setError("Add the value you intend to confirm.");
      return;
    }
    const resourceId = selectedResource.resource.id;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/resource-claims/${claim.id}/decisions`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            expected_assertion_version: claim.version,
            decision,
            ...(decision === "confirm"
              ? { corrected_value: correctedValue }
              : {}),
          }),
        },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(
          payload.message ?? "The fact decision could not be saved.",
        );
      }
      await openResource(resourceId);
      await loadResources();
      onEvidenceChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The fact decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedResource() {
    if (!selectedResource) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/captures/${selectedResource.resource.capture_id}/deletion`,
        {
          method: "POST",
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as {
        message?: string;
        compilation?: { status?: string } | null;
        compilation_error?: string | null;
      };
      if (!response.ok) {
        throw new Error(
          payload.message ?? "The governed source could not be deleted.",
        );
      }
      setSelectedResource(null);
      setDeleteResourceConfirm(false);
      const relationshipRemoved =
        !payload.compilation && !payload.compilation_error;
      const announcement = payload.compilation?.status === "published"
        ? "Source lineage deleted. The relationship Wiki was rebuilt from the governed sources that remain."
        : payload.compilation_error
          ? `Source lineage deleted. Wiki recompilation needs attention: ${payload.compilation_error}`
          : "Source lineage deleted. No active relationship remains.";
      if (relationshipRemoved) {
        onEvidenceChanged(announcement, true);
        return;
      }
      await loadResources();
      onEvidenceChanged(announcement);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The governed source could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideSelectedSourceAuthorization() {
    if (!selectedResource || !sourceAuthorizationReason.trim()) {
      return;
    }
    const decision =
      selectedResource.resource.source_authorization_state ===
      "authorized"
        ? "revoke"
        : "restore";
    let authorizationExpiresAt: string | undefined;
    if (decision === "restore" && sourceAuthorizationExpiresAt) {
      const parsedExpiry = new Date(sourceAuthorizationExpiresAt);
      if (
        !Number.isFinite(parsedExpiry.getTime()) ||
        parsedExpiry <= new Date()
      ) {
        setError(
          "Choose a source-authorization deadline in the future.",
        );
        return;
      }
      authorizationExpiresAt = parsedExpiry.toISOString();
    }
    const resourceId = selectedResource.resource.id;
    setBusy(true);
    setError("");
    sourceAuthorizationRequestRef.current ??= crypto.randomUUID();
    try {
      const response = await fetch(
        `/api/local-integration/captures/${selectedResource.resource.capture_id}/source-authorization`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key:
              sourceAuthorizationRequestRef.current,
            expected_capture_version:
              selectedResource.resource.capture_version,
            decision,
            reason: sourceAuthorizationReason.trim(),
            ...(authorizationExpiresAt
              ? {
                  authorization_expires_at:
                    authorizationExpiresAt,
                }
              : {}),
          }),
        },
      );
      const payload = (await response.json()) as
        | SourceAuthorizationDecisionResponse
        | { message?: string };
      if (!response.ok || !("authorization_state" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The source authorization could not be changed.",
        );
      }
      await openResource(resourceId);
      await loadResources();
      setSourceAuthorizationOpen(false);
      resetSourceAuthorizationDecision();
      const externalEffectFollowUp =
        payload.external_effects_requiring_follow_up > 0
          ? ` ${payload.external_effects_requiring_follow_up} ${
              payload.external_effects_requiring_follow_up === 1
                ? "external effect still requires"
                : "external effects still require"
            } recruiter follow-up; nothing already completed was represented as undone.`
          : "";
      const authorizationMessage =
        payload.decision === "revoke"
          ? payload.compilation
            ? `Source access revoked. ${payload.states_retracted} confirmed ${
                payload.states_retracted === 1 ? "state was" : "states were"
              } withdrawn, and the relationship Wiki was rebuilt from authorized sources that remain.`
            : `Source access revoked. Wiki recompilation needs attention: ${
                payload.compilation_error ??
                "no authorized relationship memory was publishable"
              }`
          : payload.compilation
            ? `Source access restored for review. ${payload.claims_reopened} ${
                payload.claims_reopened === 1 ? "claim is" : "claims are"
              } pending; no prior conclusion or action was restored automatically.`
            : `Source access restored for review. Wiki recompilation needs attention: ${
                payload.compilation_error ??
                "the restored evidence still requires review"
              }`;
      await onEvidenceChanged(
        `${authorizationMessage}${externalEffectFollowUp}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The source authorization could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function resetRequest() {
    requestIdRef.current = null;
    requestCapturedAtRef.current = null;
    setReceipt(null);
    setError("");
  }

  async function submit() {
    if (
      (mode === "document" && !file) ||
      (mode === "conversation" &&
        (transcriptMessages.length === 0 ||
          !transcriptAttributionReviewed)) ||
      (mode !== "document" && mode !== "conversation" && !value.trim())
    ) {
      setError(
        mode === "document"
          ? "Choose one resume or document."
          : mode === "conversation"
            ? "Analyze the transcript and confirm every speaker label."
          : "Add the context you want to preserve.",
      );
      return;
    }
    if (!requestIdRef.current) {
      requestIdRef.current = crypto.randomUUID();
      requestCapturedAtRef.current = new Date().toISOString();
    }
    const capturedAt = requestCapturedAtRef.current;
    if (!capturedAt) {
      setError("The source observation time could not be preserved.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let response: Response;
      if (mode === "document" && file) {
        const form = new FormData();
        form.set("request_id", requestIdRef.current);
        form.set("captured_at", capturedAt);
        form.set("person_id", personId);
        form.set("relationship_context_id", relationshipContextId);
        form.set("document_kind", documentKind);
        form.set(
          "save_discovered_links",
          saveDiscoveredLinks ? "true" : "false",
        );
        form.set("file", file);
        response = await fetch("/api/local-integration/resources", {
          method: "POST",
          body: form,
          cache: "no-store",
        });
      } else {
        response = await fetch("/api/local-integration/resources", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestIdRef.current,
            captured_at: capturedAt,
            person_id: personId,
            relationship_context_id: relationshipContextId,
            type: mode,
            title: title.trim() || undefined,
            value: value.trim(),
            ...(mode === "conversation"
              ? {
                  transcript_messages: transcriptMessages,
                  attribution_reviewed: transcriptAttributionReviewed,
                }
              : {}),
          }),
        });
      }
      const payload = (await response.json()) as
        | {
            receipts: ResourceCaptureResponse[];
            discovered_links: string[];
            parser_warnings: string[];
          }
        | { message?: string };
      if (!response.ok || !("receipts" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The context could not be attached.",
        );
      }
      setReceipt({
        resources: payload.receipts.length,
        linksFound: payload.discovered_links.length,
        warnings: payload.parser_warnings.length,
      });
      setTitle("");
      setValue("");
      setTranscriptMessages([]);
      setTranscriptAttributionReviewed(false);
      setFile(null);
      onCommitted(payload.receipts);
      await loadResources();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The context could not be attached.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="add-context-title"
      className="context-resource-composer"
      id="relationship-resources"
    >
      <div className="context-resource-composer__heading">
        <div>
          <p className="eyebrow">ADD CONTEXT</p>
          <h2 id="add-context-title">One person, more than one source.</h2>
          <p>
            Attach to {scopeLabel}. Each source keeps its own authority,
            evidence location, and deletion path.
          </p>
        </div>
        <div aria-label="Context source type" role="tablist">
          <button
            aria-selected={mode === "note"}
            onClick={() => {
              setMode("note");
              resetRequest();
            }}
            role="tab"
            type="button"
          >
            <PencilSimple aria-hidden="true" size={16} />
            Note
          </button>
          <button
            aria-selected={mode === "conversation"}
            onClick={() => {
              setMode("conversation");
              resetRequest();
            }}
            role="tab"
            type="button"
          >
            <ChatCircleDots aria-hidden="true" size={16} />
            Transcript
          </button>
          <button
            aria-selected={mode === "document"}
            onClick={() => {
              setMode("document");
              resetRequest();
            }}
            role="tab"
            type="button"
          >
            <UploadSimple aria-hidden="true" size={16} />
            File
          </button>
          <button
            aria-selected={mode === "url"}
            onClick={() => {
              setMode("url");
              resetRequest();
            }}
            role="tab"
            type="button"
          >
            <LinkSimple aria-hidden="true" size={16} />
            Link
          </button>
          <button onClick={onScreenshot} type="button">
            <FileImage aria-hidden="true" size={16} />
            Screenshot
          </button>
        </div>
      </div>

      {mode === "conversation" ? (
        <ConversationTranscriptComposer
          attributionReviewed={transcriptAttributionReviewed}
          messages={transcriptMessages}
          onAttributionReviewedChange={(reviewed) => {
            setTranscriptAttributionReviewed(reviewed);
            resetRequest();
          }}
          onMessagesChange={(messages) => {
            setTranscriptMessages(messages);
            resetRequest();
          }}
          onTitleChange={(nextTitle) => {
            setTitle(nextTitle);
            resetRequest();
          }}
          onValueChange={(nextValue) => {
            setValue(nextValue);
            resetRequest();
          }}
          title={title}
          value={value}
        />
      ) : mode === "document" ? (
        <div className="context-resource-composer__document">
          <input
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            className="sr-only"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              resetRequest();
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="context-resource-file"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <UploadSimple aria-hidden="true" size={20} />
            <span>
              <strong>{file?.name ?? "Choose PDF, DOCX, TXT, or Markdown"}</strong>
              <small>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                  : "Raw file is parsed transiently and is not retained."}
              </small>
            </span>
          </button>
          <label>
            <span>Document meaning</span>
            <select
              onChange={(event) => {
                setDocumentKind(
                  event.target.value as "resume" | "document",
                );
                resetRequest();
              }}
              value={documentKind}
            >
              <option value="resume">Resume</option>
              <option value="document">Supporting document</option>
            </select>
          </label>
          <label className="context-resource-checkbox">
            <input
              checked={saveDiscoveredLinks}
              onChange={(event) => {
                setSaveDiscoveredLinks(event.target.checked);
                resetRequest();
              }}
              type="checkbox"
            />
            <span>
              Save visible URLs as research seeds
              <small>
                This does not fetch pages or authorize deep research.
              </small>
            </span>
          </label>
        </div>
      ) : (
        <div className="context-resource-composer__text">
          <label>
            <span>{mode === "note" ? "Note title" : "Link label"}</span>
            <input
              maxLength={240}
              onChange={(event) => {
                setTitle(event.target.value);
                resetRequest();
              }}
              placeholder={
                mode === "note"
                  ? "e.g. Prep for Thursday call"
                  : "e.g. Portfolio or public profile"
              }
              value={title}
            />
          </label>
          <label>
            <span>{mode === "note" ? "Your note" : "Public URL"}</span>
            {mode === "note" ? (
              <textarea
                maxLength={40_000}
                onChange={(event) => {
                  setValue(event.target.value);
                  resetRequest();
                }}
                placeholder="What do you want your future self to remember? This remains a recruiter-authored note, not candidate testimony."
                rows={3}
                value={value}
              />
            ) : (
              <input
                maxLength={2_000}
                onChange={(event) => {
                  setValue(event.target.value);
                  resetRequest();
                }}
                placeholder="https://"
                type="url"
                value={value}
              />
            )}
          </label>
        </div>
      )}

      {error ? (
        <p className="context-resource-composer__error" role="alert">
          <Warning aria-hidden="true" size={16} />
          {error}
        </p>
      ) : null}
      {receipt ? (
        <p className="context-resource-composer__receipt" role="status">
          <CheckCircle aria-hidden="true" size={17} weight="fill" />
          {receipt.resources} governed{" "}
          {receipt.resources === 1 ? "resource" : "resources"} attached
          {receipt.linksFound > 0
            ? ` · ${receipt.linksFound} visible links found`
            : ""}
          {receipt.warnings > 0
            ? ` · ${receipt.warnings} parser warnings retained`
            : ""}
        </p>
      ) : null}
      <footer>
        <p>
          Every source remains separately reviewable. Saving a URL is not
          permission to crawl it.
        </p>
        <button
          className="context-primary-button context-primary-button--compact"
          disabled={
            busy ||
            (mode === "document"
              ? !file
              : mode === "conversation"
                ? transcriptMessages.length === 0 ||
                  !transcriptAttributionReviewed
                : !value.trim())
          }
          onClick={() => void submit()}
          type="button"
        >
          {busy ? (
            <CircleNotch aria-hidden="true" className="spin" size={17} />
          ) : (
            <Plus aria-hidden="true" size={17} />
          )}
          {busy ? "Attaching source" : "Attach to person"}
        </button>
      </footer>

      <div className="context-resource-ledger">
        <div>
          <h3>Sources on this relationship</h3>
          <span>
            {resourceLoading
              ? "Loading…"
              : `${resources.length} governed ${
                  resources.length === 1 ? "source" : "sources"
                }`}
          </span>
        </div>
        {resources.length > 0 ? (
          <div className="context-resource-ledger__list">
            {resources.map((resource) => (
              <button
                data-state={resource.processing_state}
                key={resource.id}
                onClick={() => void openResource(resource.id)}
                type="button"
              >
                <span>
                  {resource.kind === "personal_note" ? (
                    <PencilSimple aria-hidden="true" size={17} />
                  ) : resource.kind === "conversation_transcript" ? (
                    <ChatCircleDots aria-hidden="true" size={17} />
                  ) : resource.kind === "public_url" ? (
                    <LinkSimple aria-hidden="true" size={17} />
                  ) : (
                    <UploadSimple aria-hidden="true" size={17} />
                  )}
                </span>
                <p>
                  <strong>{resource.display_name}</strong>
                  <small>
                    {resource.kind.replaceAll("_", " ")} ·{" "}
                    {resource.source_authorization_state === "revoked"
                      ? "Access revoked · evidence excluded from memory"
                      : resource.source_authorization_state === "expired"
                        ? "Authorization expired · evidence excluded from memory"
                      : resource.proposed_fragment_count > 0
                      ? `${resource.proposed_fragment_count} excerpts need review`
                      : resource.pending_claim_count > 0
                        ? `${resource.pending_claim_count} facts need review${
                            resource.conflicted_claim_count > 0
                              ? ` · ${resource.conflicted_claim_count} conflicting`
                              : ""
                          }`
                      : "Evidence reviewed"}
                    {resource.duplicate_of_resource_id
                      ? " · duplicate retained"
                      : ""}
                    {resource.source_authorization_state ===
                      "authorized" &&
                    resource.source_authorization_expires_at
                      ? ` · authorized until ${formatDate(
                          resource.source_authorization_expires_at,
                        )}`
                      : ""}
                  </small>
                </p>
                <i>
                  {resource.source_authorization_state !== "authorized"
                    ? resource.source_authorization_state
                    : resource.processing_state.replaceAll("_", " ")}
                </i>
              </button>
            ))}
          </div>
        ) : resourceLoading ? null : (
          <p className="context-resource-ledger__empty">
            No additional note, transcript, file, or link is attached yet.
          </p>
        )}
      </div>

      {selectedResource ? (
        <div className="context-resource-review">
          <header>
            <div>
              <p className="eyebrow">EVIDENCE REVIEW</p>
              <h3>{selectedResource.resource.display_name}</h3>
              <span>
                {selectedResource.resource.kind.replaceAll("_", " ")} ·{" "}
                {selectedResource.resource.source_authorization_state !==
                "authorized"
                  ? selectedResource.resource.source_authorization_state ===
                    "expired"
                    ? "authorization expired"
                    : "access revoked"
                  : `${selectedResource.fragments.length} addressable ${
                      selectedResource.fragments.length === 1
                        ? "fragment"
                        : "fragments"
                    }`}
              </span>
            </div>
            <div className="context-resource-review__actions">
              <button
                aria-expanded={identityCorrectionOpen}
                className="context-text-button"
                onClick={() => {
                  if (identityCorrectionOpen) {
                    setIdentityCorrectionOpen(false);
                  } else {
                    void beginIdentityCorrection();
                  }
                }}
                type="button"
              >
                <PencilSimple aria-hidden="true" size={15} />
                Wrong person?
              </button>
              <button
                aria-expanded={sourceAuthorizationOpen}
                className="context-text-button"
                onClick={() => {
                  setDeleteResourceConfirm(false);
                  setIdentityCorrectionOpen(false);
                  if (sourceAuthorizationOpen) {
                    setSourceAuthorizationOpen(false);
                    resetSourceAuthorizationDecision();
                  } else {
                    setSourceAuthorizationOpen(true);
                  }
                }}
                type="button"
              >
                {selectedResource.resource
                  .source_authorization_state === "authorized" ? (
                  <Prohibit aria-hidden="true" size={15} />
                ) : (
                  <ShieldCheck aria-hidden="true" size={15} />
                )}
                {selectedResource.resource
                  .source_authorization_state === "authorized"
                  ? "Revoke access"
                  : selectedResource.resource
                        .source_authorization_state === "expired"
                    ? "Renew access"
                    : "Restore access"}
              </button>
              <button
                className="context-text-button"
                onClick={() => {
                  setSourceAuthorizationOpen(false);
                  resetSourceAuthorizationDecision();
                  setDeleteResourceConfirm((current) => !current);
                }}
                type="button"
              >
                <Trash aria-hidden="true" size={15} />
                Delete source
              </button>
              <button
                aria-label="Close evidence review"
                className="context-icon-button"
                onClick={() => {
                  setSelectedResource(null);
                  setClaimEdits({});
                  setDeleteResourceConfirm(false);
                  setResearchApproval(false);
                  setResearchResult(null);
                  setIdentityCorrectionOpen(false);
                  setIdentityCorrectionReason("");
                  resetIdentityCorrectionRequest();
                  setSourceAuthorizationOpen(false);
                  resetSourceAuthorizationDecision();
                }}
                type="button"
              >
                <X aria-hidden="true" size={17} />
              </button>
            </div>
          </header>
          {sourceAuthorizationOpen ? (
            <section className="context-identity-correction">
              <header>
                <div>
                  <p className="eyebrow">SOURCE AUTHORIZATION</p>
                  <h4>
                    {selectedResource.resource
                      .source_authorization_state === "authorized"
                      ? "Remove this source from relationship memory."
                      : selectedResource.resource
                            .source_authorization_state === "expired"
                        ? "Renew this source as reviewable evidence."
                        : "Return this source as reviewable evidence."}
                  </h4>
                </div>
                {selectedResource.resource
                  .source_authorization_state === "authorized" ? (
                  <Prohibit aria-hidden="true" size={19} />
                ) : (
                  <ShieldCheck aria-hidden="true" size={19} />
                )}
              </header>
              <p>
                {selectedResource.resource
                  .source_authorization_state === "authorized"
                  ? "Revoking access hides the evidence, withdraws dependent facts and pending actions, and rebuilds the Wiki from authorized sources that remain. It does not delete the governed source, so access can be restored later."
                  : selectedResource.resource
                        .source_authorization_state === "expired"
                    ? "Renewing authorization reveals the governed evidence again, but every source-derived claim returns to recruiter review. Prior facts, approvals, and actions stay withdrawn."
                    : "Restoring access reveals the governed evidence again, but every source-derived claim returns to recruiter review. Prior facts, approvals, and actions stay withdrawn."}
              </p>
              <label className="context-identity-correction__reason">
                <span>Why is this authorization changing?</span>
                <textarea
                  maxLength={500}
                  onChange={(event) => {
                    setSourceAuthorizationReason(
                      event.currentTarget.value,
                    );
                    sourceAuthorizationRequestRef.current = null;
                  }}
                  placeholder={
                    selectedResource.resource
                      .source_authorization_state === "authorized"
                      ? "For example: the candidate withdrew permission to use this conversation."
                      : "For example: the recruiter confirmed renewed permission for this purpose."
                  }
                  rows={3}
                  value={sourceAuthorizationReason}
                />
              </label>
              {selectedResource.resource
                .source_authorization_state !== "authorized" ? (
                <label className="context-identity-correction__reason">
                  <span>
                    New authorization deadline
                    {selectedResource.resource
                      .source_authorization_state === "expired"
                      ? " (recommended)"
                      : " (optional)"}
                  </span>
                  <input
                    onChange={(event) => {
                      setSourceAuthorizationExpiresAt(
                        event.currentTarget.value,
                      );
                      sourceAuthorizationRequestRef.current = null;
                    }}
                    type="datetime-local"
                    value={sourceAuthorizationExpiresAt}
                  />
                  <small>
                    This governs use of the evidence, independently
                    from how long the original file is retained.
                  </small>
                </label>
              ) : null}
              <footer>
                <button
                  className="context-secondary-button"
                  onClick={() => {
                    setSourceAuthorizationOpen(false);
                    resetSourceAuthorizationDecision();
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={
                    selectedResource.resource
                      .source_authorization_state === "authorized"
                      ? "context-danger-button"
                      : "context-primary-button context-primary-button--compact"
                  }
                  disabled={
                    busy || !sourceAuthorizationReason.trim()
                  }
                  onClick={() =>
                    void decideSelectedSourceAuthorization()
                  }
                  type="button"
                >
                  {busy ? (
                    <CircleNotch
                      aria-hidden="true"
                      className="spin"
                      size={16}
                    />
                  ) : null}
                  {selectedResource.resource
                    .source_authorization_state === "authorized"
                    ? "Revoke and rebuild Wiki"
                    : selectedResource.resource
                          .source_authorization_state === "expired"
                      ? "Renew for review"
                      : "Restore for review"}
                </button>
              </footer>
            </section>
          ) : null}
          {deleteResourceConfirm ? (
            <div className="context-resource-review__delete">
              <p>
                This retracts this source, sources discovered from it, and
                every dependent Wiki or Chat snapshot.
              </p>
              <button
                className="context-secondary-button"
                onClick={() => setDeleteResourceConfirm(false)}
                type="button"
              >
                Keep source
              </button>
              <button
                className="context-danger-button"
                disabled={busy}
                onClick={() => void deleteSelectedResource()}
                type="button"
              >
                Delete governed lineage
              </button>
            </div>
          ) : null}
          {identityCorrectionOpen ? (
            <section className="context-identity-correction">
              <header>
                <div>
                  <p className="eyebrow">IDENTITY CORRECTION</p>
                  <h4>Move this governed source to the right person.</h4>
                </div>
                <Warning aria-hidden="true" size={19} />
              </header>
              <p>
                This source and anything discovered from it move together.
                Facts confirmed under {scopeLabel} are withdrawn; the new
                relationship receives reviewable proposals, never automatic
                truth.
              </p>
              <div
                aria-label="Identity correction target type"
                className="context-identity-correction__mode"
                role="group"
              >
                <button
                  aria-pressed={identityTargetMode === "existing"}
                  disabled={identityPeople.length === 0}
                  onClick={() => {
                    setIdentityTargetMode("existing");
                    resetIdentityCorrectionRequest();
                  }}
                  type="button"
                >
                  Existing person
                </button>
                <button
                  aria-pressed={identityTargetMode === "new"}
                  onClick={() => {
                    setIdentityTargetMode("new");
                    resetIdentityCorrectionRequest();
                  }}
                  type="button"
                >
                  New person
                </button>
              </div>
              {identityPeopleLoading ? (
                <p className="context-identity-correction__loading">
                  <CircleNotch
                    aria-hidden="true"
                    className="spin"
                    size={16}
                  />
                  Loading governed people…
                </p>
              ) : identityTargetMode === "existing" ? (
                <div className="context-identity-correction__fields">
                  <label>
                    <span>Correct person</span>
                    <select
                      disabled={busy}
                      onChange={(event) => {
                        setIdentityTargetPersonId(event.target.value);
                        setIdentityTargetContextId("");
                        setIdentityNewContextLabel("");
                        resetIdentityCorrectionRequest();
                      }}
                      value={identityTargetPersonId}
                    >
                      <option disabled value="">
                        Choose the correct person…
                      </option>
                      {identityPeople.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.display_label} · {person.capture_count}{" "}
                          sources
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Relationship context</span>
                    <select
                      disabled={busy}
                      onChange={(event) => {
                        setIdentityTargetContextId(event.target.value);
                        resetIdentityCorrectionRequest();
                      }}
                      value={identityTargetContextId}
                    >
                      <option disabled value="">
                        Choose the relationship context…
                      </option>
                      {identityTargetPerson?.contexts.map((context) => (
                        <option key={context.id} value={context.id}>
                          {context.display_label}
                        </option>
                      ))}
                      <option value="__new__">
                        Create a separate context…
                      </option>
                    </select>
                  </label>
                  {identityTargetContextId === "__new__" ? (
                    <label>
                      <span>New context label</span>
                      <input
                        disabled={busy}
                        maxLength={200}
                        onChange={(event) => {
                          setIdentityNewContextLabel(event.target.value);
                          resetIdentityCorrectionRequest();
                        }}
                        placeholder="e.g. VP Product · Northstar search"
                        value={identityNewContextLabel}
                      />
                    </label>
                  ) : null}
                </div>
              ) : (
                <div className="context-identity-correction__fields">
                  <label>
                    <span>New person name</span>
                    <input
                      disabled={busy}
                      maxLength={200}
                      onChange={(event) => {
                        setIdentityNewPersonLabel(event.target.value);
                        resetIdentityCorrectionRequest();
                      }}
                      placeholder="e.g. Maya Chen"
                      value={identityNewPersonLabel}
                    />
                  </label>
                  <label>
                    <span>Relationship context</span>
                    <input
                      disabled={busy}
                      maxLength={200}
                      onChange={(event) => {
                        setIdentityNewContextLabel(event.target.value);
                        resetIdentityCorrectionRequest();
                      }}
                      placeholder="e.g. VP Product · Northstar search"
                      value={identityNewContextLabel}
                    />
                  </label>
                </div>
              )}
              <label className="context-identity-correction__reason">
                <span>Why is this the right identity?</span>
                <textarea
                  disabled={busy}
                  maxLength={500}
                  onChange={(event) => {
                    setIdentityCorrectionReason(event.target.value);
                    resetIdentityCorrectionRequest();
                  }}
                  placeholder="e.g. The email address and employment history match the existing contact."
                  rows={2}
                  value={identityCorrectionReason}
                />
              </label>
              <footer>
                <p>
                  Pending actions are revoked. In-flight effects must be
                  reconciled before the move can proceed.
                </p>
                <div>
                  <button
                    className="context-text-button"
                    disabled={busy}
                    onClick={() => setIdentityCorrectionOpen(false)}
                    type="button"
                  >
                    Keep current identity
                  </button>
                  <button
                    className="context-primary-button context-primary-button--compact"
                    disabled={
                      busy ||
                      !identityCorrectionReason.trim() ||
                      (identityTargetMode === "existing"
                        ? !identityTargetPerson ||
                          !identityTargetContextId ||
                          (identityTargetContextId === "__new__" &&
                            !identityNewContextLabel.trim())
                        : !identityNewPersonLabel.trim() ||
                          !identityNewContextLabel.trim())
                    }
                    onClick={() =>
                      void correctSelectedResourceIdentity()
                    }
                    type="button"
                  >
                    {busy ? (
                      <CircleNotch
                        aria-hidden="true"
                        className="spin"
                        size={16}
                      />
                    ) : (
                      <ArrowRight aria-hidden="true" size={16} />
                    )}
                    Move source lineage
                  </button>
                </div>
              </footer>
            </section>
          ) : null}
          {selectedResource.resource.kind === "public_url" &&
          selectedResource.resource.input_channel !== "api_connector" &&
          selectedResource.resource.source_locator ? (
            <section className="context-research-approval">
              <div>
                <p className="eyebrow">PUBLIC RESEARCH</p>
                <h4>Choose the boundary before AI reads beyond the seed.</h4>
                <p>
                  Approved domain:{" "}
                  <strong>
                    {
                      new URL(
                        selectedResource.resource.source_locator,
                      ).hostname
                    }
                  </strong>
                  . Every retrieved page returns as proposed evidence with
                  its URL, retrieval time, freshness, and deletion lineage.
                </p>
              </div>
              <div className="context-research-approval__scope">
                <label>
                  <span>Maximum pages</span>
                  <select
                    disabled={busy}
                    onChange={(event) =>
                      setResearchPageCount(Number(event.target.value))
                    }
                    value={researchPageCount}
                  >
                    <option value={1}>1 page</option>
                    <option value={3}>Up to 3 pages</option>
                    <option value={5}>Up to 5 pages</option>
                  </select>
                </label>
                <label>
                  <span>Follow links</span>
                  <select
                    disabled={busy}
                    onChange={(event) =>
                      setResearchLinkDepth(Number(event.target.value))
                    }
                    value={researchLinkDepth}
                  >
                    <option value={0}>Seed page only</option>
                    <option value={1}>One same-domain layer</option>
                  </select>
                </label>
              </div>
              <label className="context-resource-checkbox">
                <input
                  checked={researchApproval}
                  disabled={busy}
                  onChange={(event) =>
                    setResearchApproval(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  I approve this bounded public research
                  <small>
                    HTTPS only. Private networks and cross-domain redirects
                    are blocked.
                  </small>
                </span>
              </label>
              {researchResult ? (
                <div
                  className={`context-research-status context-research-status--${researchResult.status}`}
                  role="status"
                >
                  <div className="context-research-status__summary">
                    {researchResult.status === "running" ? (
                      <CircleNotch
                        aria-hidden="true"
                        className="spin"
                        size={17}
                      />
                    ) : researchResult.status === "completed" ? (
                      <CheckCircle
                        aria-hidden="true"
                        size={17}
                        weight="fill"
                      />
                    ) : (
                      <Warning
                        aria-hidden="true"
                        size={17}
                        weight="fill"
                      />
                    )}
                    <span>
                      {researchResult.status === "running"
                        ? "Research is still running. Its durable task can be checked after a refresh or interruption."
                        : `${researchResult.pages.length} public ${
                            researchResult.pages.length === 1
                              ? "page"
                              : "pages"
                          } returned as proposed evidence · ${
                            researchResult.status
                          }`}
                    </span>
                  </div>
                  {researchResult.warnings.length > 0 ? (
                    <div className="context-research-status__warnings">
                      <strong>
                        {researchResult.warnings.length} page-level{" "}
                        {researchResult.warnings.length === 1
                          ? "warning"
                          : "warnings"}
                      </strong>
                      <ul>
                        {researchResult.warnings
                          .slice(0, 5)
                          .map((warning, index) => (
                            <li key={`${researchResult.task_id}:${index}`}>
                              {warning}
                            </li>
                          ))}
                      </ul>
                      <small>
                        Retrieval warnings are operational evidence, not
                        claims about this person.
                      </small>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <footer>
                <p>
                  Research never confirms a person fact and never contacts
                  anyone.
                </p>
                <button
                  className="context-primary-button context-primary-button--compact"
                  disabled={
                    researchResult?.status === "running"
                      ? busy
                      : !researchApproval || busy
                  }
                  onClick={() =>
                    void (researchResult?.status === "running"
                      ? refreshResearchStatus()
                      : researchSelectedResource())
                  }
                  type="button"
                >
                  {busy ? (
                    <CircleNotch
                      aria-hidden="true"
                      className="spin"
                      size={17}
                    />
                  ) : (
                    <Sparkle aria-hidden="true" size={17} />
                  )}
                  {busy
                    ? researchResult?.status === "running"
                      ? "Checking durable task"
                      : "Researching public pages"
                    : researchResult?.status === "running"
                      ? "Check research status"
                      : "Run public research"}
                </button>
              </footer>
            </section>
          ) : null}
          {selectedResource.resource.kind === "conversation_screenshot" &&
          selectedResource.resource.processing_state ===
            "needs_fact_review" ? (
            <section className="context-capture-review-bridge">
              <div>
                <span>
                  <FileImage aria-hidden="true" size={18} weight="duotone" />
                </span>
                <p>
                  <strong>Screenshot facts still need your judgment</strong>
                  <small>
                    Transcription review and fact decisions remain separate.
                    Open the original capture review to confirm, dismiss, or
                    leave each proposal unresolved.
                  </small>
                </p>
              </div>
              <a
                className="context-secondary-button"
                href={`/workspace?capture=${selectedResource.resource.capture_id}#proposed-changes`}
              >
                Continue fact review
                <ArrowRight aria-hidden="true" size={15} />
              </a>
            </section>
          ) : null}
          {selectedResource.claim_proposals.length > 0 ? (
            <section className="context-claim-review">
              <header>
                <div>
                  <p className="eyebrow">PROPOSED PERSON UPDATES</p>
                  <h4>Decide what becomes part of this relationship.</h4>
                </div>
                <span>
                  {
                    selectedResource.claim_proposals.filter((claim) =>
                      ["pending", "unresolved"].includes(
                        claim.review_status,
                      ),
                    ).length
                  }{" "}
                  open
                </span>
              </header>
              <p>
                Each update keeps the exact source fragment. Conflicting
                claims stay separate until you choose the current value.
              </p>
              <div className="context-claim-review__list">
                {selectedResource.claim_proposals.map((claim) => {
                  const open = ["pending", "unresolved"].includes(
                    claim.review_status,
                  );
                  const conflicting =
                    claim.proposal_status === "ambiguous" ||
                    claim.temporal_relation === "supersedes";
                  return (
                    <article
                      data-conflict={conflicting}
                      data-state={claim.review_status}
                      key={claim.id}
                    >
                      <header>
                        <div>
                          <strong>{fieldLabel(claim.field)}</strong>
                          <span>
                            {claim.review_status === "confirmed"
                              ? "Confirmed for this relationship"
                              : claim.review_status === "dismissed"
                                ? "Dismissed by recruiter"
                                : claim.temporal_relation === "supersedes"
                                  ? "Review before replacing current value"
                                  : claim.temporal_relation === "reinforces"
                                    ? "Reinforces current value"
                                    : "New proposed fact"}
                          </span>
                        </div>
                        <i>{reviewLabel(claim.review_status)}</i>
                      </header>
                      {claim.prior_confirmed_value ? (
                        <div
                          aria-label="Proposed fact change"
                          className="context-claim-review__diff"
                        >
                          <span>
                            <small>Before</small>
                            <del>{claim.prior_confirmed_value}</del>
                          </span>
                          <ArrowRight aria-hidden="true" size={15} />
                          <span>
                            <small>Proposed</small>
                            <ins>{claimEdits[claim.id] ?? ""}</ins>
                          </span>
                        </div>
                      ) : null}
                      <label>
                        <span>Value to confirm</span>
                        <input
                          disabled={!open || busy}
                          maxLength={2_000}
                          onChange={(event) =>
                            setClaimEdits((current) => ({
                              ...current,
                              [claim.id]: event.target.value,
                            }))
                          }
                          value={claimEdits[claim.id] ?? ""}
                        />
                      </label>
                      <blockquote>
                        <Quotes aria-hidden="true" size={15} />
                        <span>
                          {claim.evidence_quote ??
                            "No exact source quote is available."}
                        </span>
                      </blockquote>
                      <p>
                        {claim.producer.name} {claim.producer.version} ·
                        source fragment {claim.evidence_fragment_id.slice(0, 8)}
                      </p>
                      {open ? (
                        <footer>
                          <button
                            className="context-text-button"
                            disabled={busy}
                            onClick={() =>
                              void decideClaim(claim, "dismiss")
                            }
                            type="button"
                          >
                            Dismiss
                          </button>
                          <button
                            className="context-secondary-button"
                            disabled={busy}
                            onClick={() =>
                              void decideClaim(
                                claim,
                                "leave_unresolved",
                              )
                            }
                            type="button"
                          >
                            Leave unresolved
                          </button>
                          <button
                            className="context-primary-button"
                            disabled={
                              busy ||
                              !(claimEdits[claim.id] ?? "").trim()
                            }
                            onClick={() =>
                              void decideClaim(claim, "confirm")
                            }
                            type="button"
                          >
                            <Check aria-hidden="true" size={16} />
                            Confirm for this relationship
                          </button>
                        </footer>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
          <div>
            {selectedResource.fragments.map((fragment) => (
              <article
                data-state={fragment.review_status}
                key={fragment.id}
              >
                <header>
                  <span>
                    {fragment.locator.kind.replaceAll("_", " ")} ·{" "}
                    {fragment.sequence + 1}
                  </span>
                  <i>{fragment.review_status}</i>
                </header>
                <pre>{fragment.text}</pre>
                <p>
                  {fragment.attribution.actor_kind.replaceAll("_", " ")} ·{" "}
                  attribution {fragment.attribution.status} ·{" "}
                  {fragment.parser.name} {fragment.parser.version}
                </p>
                {fragment.review_status === "proposed" ? (
                  <footer>
                    <button
                      className="context-secondary-button"
                      disabled={busy}
                      onClick={() =>
                        void decideFragment(
                          fragment.id,
                          fragment.review_status,
                          "rejected",
                        )
                      }
                      type="button"
                    >
                      Reject extraction
                    </button>
                    <button
                      className="context-primary-button"
                      disabled={busy}
                      onClick={() =>
                        void decideFragment(
                          fragment.id,
                          fragment.review_status,
                          "reviewed",
                        )
                      }
                      type="button"
                    >
                      <Check aria-hidden="true" size={16} />
                      Extraction matches source
                    </button>
                  </footer>
                ) : null}
              </article>
            ))}
          </div>
          <p>
            Reviewing confirms transcription accuracy only. It does not make
            the document&apos;s claims current facts about the person.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function AgentIdentityReviewCard({
  identityCase,
  onCaseUpdated,
  onResolved,
}: {
  identityCase: IdentityResolutionCase;
  onCaseUpdated: (nextCase: IdentityResolutionCase) => void;
  onResolved: (
    scope: RelationshipScope,
    compilation: KnowledgeSnapshot | null,
    compilationError: string | null,
  ) => void;
}) {
  const requestIdRef = useRef<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedContextId, setSelectedContextId] = useState("");
  const [newContextLabel, setNewContextLabel] = useState(
    identityCase.relationship_context?.status === "proposed"
      ? identityCase.relationship_context.label
      : "",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedCandidate = identityCase.candidates.find(
    (candidate) => candidate.person_id === selectedPersonId,
  );
  const selectedExistingContext =
    selectedCandidate?.relationship_contexts.find(
      (context) => context.id === selectedContextId,
    ) ?? null;
  const usingNewContext = selectedContextId === "__new__";
  const bindReady =
    selectedCandidate !== undefined &&
    reason.trim().length > 0 &&
    ((usingNewContext && newContextLabel.trim().length > 0) ||
      selectedExistingContext !== null);

  function resetRequest() {
    requestIdRef.current = null;
  }

  async function decideIdentity(
    decision: "bind_existing" | "leave_unresolved",
  ) {
    if (
      !reason.trim() ||
      (decision === "bind_existing" && !bindReady)
    ) {
      setError(
        decision === "leave_unresolved"
          ? "Say what evidence is still missing before saving this for later."
          : "Choose one person, one relationship context, and explain the identity decision.",
      );
      return;
    }
    requestIdRef.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/identity-resolution-cases/${identityCase.id}/decisions`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: requestIdRef.current,
            expected_case_version: identityCase.version,
            decision,
            reason: reason.trim(),
            ...(decision === "bind_existing" && selectedCandidate
              ? {
                  selected_person_id: selectedCandidate.person_id,
                  relationship_context:
                    usingNewContext
                      ? {
                          status: "proposed",
                          label: newContextLabel.trim(),
                          purpose:
                            "Recruiter-defined relationship context after identity review",
                        }
                      : {
                          status: "existing",
                          relationship_context_id:
                            selectedExistingContext?.id,
                        },
                }
              : {}),
          }),
        },
      );
      const payload = (await response.json()) as
        | IdentityWorkflowResponse
        | { message?: string };
      if (!response.ok || !("decision" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The identity decision could not be saved.",
        );
      }
      if (
        payload.decision.identity_status === "unresolved" ||
        !payload.decision.person_id ||
        !payload.decision.relationship_context_id ||
        !selectedCandidate
      ) {
        resetRequest();
        setReason("");
        onCaseUpdated(payload.identity_case);
        return;
      }
      onResolved(
        {
          contract_version: CONTRACT_VERSION,
          person: {
            id: payload.decision.person_id,
            display_label: selectedCandidate.display_label,
          },
          relationship_context: {
            id: payload.decision.relationship_context_id,
            display_label: usingNewContext
              ? newContextLabel.trim()
              : selectedExistingContext?.display_label ??
                "Selected relationship",
          },
        },
        payload.compilation,
        payload.compilation_error,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The identity decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="agent-identity-review-title"
      className="context-agent-identity-review"
    >
      <header>
        <span>
          <Warning aria-hidden="true" size={16} weight="fill" />
        </span>
        <div>
          <strong id="agent-identity-review-title">
            Identity still needs your decision
          </strong>
          <p>
            The source is saved, but it is not part of either person&apos;s
            Wiki yet.
          </p>
        </div>
        <i>Unresolved</i>
      </header>

      {identityCase.latest_decision?.decision === "leave_unresolved" ? (
        <div className="context-agent-identity-review__resume">
          <strong>Previously left unresolved</strong>
          <p>{identityCase.latest_decision.reason}</p>
          <small>
            Saved {formatDate(identityCase.latest_decision.decided_at)}
          </small>
        </div>
      ) : null}

      <article className="context-agent-identity-review__source">
        <header>
          <span>Governed source</span>
          <i>{identityCase.source.display_name}</i>
        </header>
        <blockquote>{identityCase.source.excerpt}</blockquote>
        <footer>
          <span>{identityCase.source.kind.replaceAll("_", " ")}</span>
          <span>
            {identityCase.source.fragment_count}{" "}
            {identityCase.source.fragment_count === 1
              ? "fragment"
              : "fragments"}
          </span>
          <span>{formatDate(identityCase.source.observed_at)}</span>
        </footer>
      </article>

      <div className="context-agent-identity-review__candidates">
        <p>
          Compare only source-backed identity clues and relationship context.
          Choosing a person does not confirm the source&apos;s claims.
        </p>
        {identityCase.candidates.map((candidate) => (
          <article
            data-selected={selectedPersonId === candidate.person_id}
            key={candidate.person_id}
          >
            <button
              aria-pressed={selectedPersonId === candidate.person_id}
              onClick={() => {
                setSelectedPersonId(candidate.person_id);
                setSelectedContextId("");
                resetRequest();
              }}
              type="button"
            >
              <span>{initials(candidate.display_label)}</span>
              <p>
                <strong>{candidate.display_label}</strong>
                <small>
                  {candidate.context_count}{" "}
                  {candidate.context_count === 1
                    ? "relationship"
                    : "relationships"}{" "}
                  · {candidate.capture_count} sources
                </small>
              </p>
              <CheckCircle aria-hidden="true" size={17} />
            </button>
            <ul aria-label={`Why ${candidate.display_label} is possible`}>
              {candidate.match_reasons.map((matchReason) => (
                <li key={matchReason}>{matchReason}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {selectedCandidate ? (
        <fieldset className="context-agent-identity-review__contexts">
          <legend>Relationship context</legend>
          <p>
            Identity is shared; evidence remains inside the selected
            relationship.
          </p>
          <div>
            {selectedCandidate.relationship_contexts.map((context) => (
              <button
                aria-pressed={selectedContextId === context.id}
                key={context.id}
                onClick={() => {
                  setSelectedContextId(context.id);
                  resetRequest();
                }}
                type="button"
              >
                <CheckCircle aria-hidden="true" size={13} />
                {context.display_label}
              </button>
            ))}
            <button
              aria-pressed={usingNewContext}
              onClick={() => {
                setSelectedContextId("__new__");
                resetRequest();
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={13} />
              New relationship
            </button>
          </div>
          {usingNewContext ? (
            <label>
              <span>New relationship label</span>
              <input
                maxLength={200}
                onChange={(event) => {
                  setNewContextLabel(event.target.value);
                  resetRequest();
                }}
                placeholder="e.g. VP Product search"
                value={newContextLabel}
              />
            </label>
          ) : null}
        </fieldset>
      ) : null}

      <label className="context-agent-identity-review__reason">
        <span>
          Decision note <small>Required</small>
        </span>
        <textarea
          maxLength={500}
          onChange={(event) => {
            setReason(event.target.value);
            resetRequest();
          }}
          placeholder="What distinguishes the right person, or what evidence is still missing?"
          rows={2}
          value={reason}
        />
      </label>
      {error ? (
        <p className="context-agent-create__error" role="alert">
          {error}
        </p>
      ) : null}
      <footer>
        <button
          className="context-secondary-button"
          disabled={busy || !reason.trim()}
          onClick={() => void decideIdentity("leave_unresolved")}
          type="button"
        >
          Leave unresolved
        </button>
        <button
          className="context-primary-button context-primary-button--compact"
          disabled={busy || !bindReady}
          onClick={() => void decideIdentity("bind_existing")}
          type="button"
        >
          {busy ? (
            <CircleNotch aria-hidden="true" className="spin" size={16} />
          ) : (
            <Check aria-hidden="true" size={16} />
          )}
          Confirm identity
        </button>
      </footer>
    </section>
  );
}

function AgentCreatePersonCard({
  onCancel,
  onCommitted,
  onDeferred,
}: {
  onCancel: () => void;
  onCommitted: (
    scope: RelationshipScope,
    receipts: ResourceCaptureResponse[],
    outcome:
      | "created_person"
      | "created_relationship_context"
      | "reused_relationship",
  ) => void;
  onDeferred: (caseId: string) => void;
}) {
  const requestIdRef = useRef<string | null>(null);
  const handleRequestIdRef = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [identityClue, setIdentityClue] = useState("");
  const [identityClueConfirmed, setIdentityClueConfirmed] =
    useState(false);
  const [contextLabel, setContextLabel] = useState("");
  const [firstNote, setFirstNote] = useState("");
  const [matches, setMatches] = useState<PersonDirectoryItem[]>([]);
  const [lookupState, setLookupState] = useState<
    "error" | "idle" | "loading" | "ready"
  >("idle");
  const [lookupRevision, setLookupRevision] = useState(0);
  const [target, setTarget] = useState<AgentPersonTarget>({
    mode: "new_person",
  });
  const [differentPersonConfirmed, setDifferentPersonConfirmed] =
    useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parsedIdentityClue = useMemo(
    () => parseIdentityHandleQuery(identityClue),
    [identityClue],
  );
  const maskedIdentityClue = parsedIdentityClue
    ? maskIdentityHandle(
        parsedIdentityClue.type,
        parsedIdentityClue.value,
      )
    : null;
  const exactMatches = exactPersonNameMatches(name, matches);
  const confirmedHandleMatches =
    confirmedHandlePersonMatches(matches);
  const expiredHandleMatches = expiredHandlePersonMatches(matches);
  const newPersonAllowed = canCreateDistinctPerson({
    differentPersonConfirmed,
    lookupState,
    matches,
    name,
  });
  const targetHasContext =
    target.mode === "existing_context" ||
    contextLabel.trim().length > 0;
  const targetSelectable =
    target.mode === "new_person" ||
    canSelectPersonForIdentityClue(target.person, matches);
  const identityChoiceNeedsReview =
    lookupState === "ready" &&
    matches.length > 0 &&
    target.mode === "new_person" &&
    (matches.length > 1 || confirmedHandleMatches.length > 0);
  const ready =
    name.trim().length > 0 &&
    (identityClue.trim().length === 0 ||
      parsedIdentityClue !== null) &&
    targetHasContext &&
    targetSelectable &&
    firstNote.trim().length > 0 &&
    (target.mode !== "new_person" || newPersonAllowed);
  const reviewReady =
    identityChoiceNeedsReview &&
    name.trim().length > 0 &&
    contextLabel.trim().length > 0 &&
    firstNote.trim().length > 0;

  useEffect(() => {
    const nameQuery = name.normalize("NFKC").trim();
    const clueQuery = parsedIdentityClue
      ? identityClue.normalize("NFKC").trim()
      : "";
    const queries = [...new Set([nameQuery, clueQuery].filter(Boolean))];
    if (queries.length === 0) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void Promise.all(
        queries.map(async (query) => {
          const response = await fetch(
            "/api/local-integration/people/search",
            {
              method: "POST",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query }),
              signal: controller.signal,
            },
          );
          const payload = (await response.json()) as
            | { people: PersonDirectoryItem[] }
            | { message?: string };
          if (!response.ok || !("people" in payload)) {
            throw new Error(
              "message" in payload && payload.message
                ? payload.message
                : "Existing people could not be checked.",
            );
          }
          return payload.people;
        }),
      )
        .then((groups) => {
          setMatches(mergePersonDirectoryMatches(groups));
          setLookupState("ready");
        })
        .catch((caught: unknown) => {
          if (
            caught instanceof DOMException &&
            caught.name === "AbortError"
          ) {
            return;
          }
          setLookupState("error");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    identityClue,
    lookupRevision,
    name,
    parsedIdentityClue,
  ]);

  async function commitPersonSource() {
    if (!ready) {
      setError(
        lookupState === "error"
          ? "Check existing people before creating a new identity."
          : "Choose the person, relationship context, and first source.",
      );
      return;
    }
    requestIdRef.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/local-integration/resources", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestIdRef.current,
          ...agentPersonScopeFields(target, name, contextLabel),
          type: "note",
          title:
            target.mode === "new_person"
              ? "First recruiter-provided context"
              : "Agent-attached recruiter context",
          value: firstNote.trim(),
        }),
      });
      const payload = (await response.json()) as
        | { receipts: ResourceCaptureResponse[] }
        | { message?: string };
      if (!response.ok || !("receipts" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The relationship source could not be saved.",
        );
      }
      const first = payload.receipts[0];
      if (
        !first?.identity.person_id ||
        !first.identity.relationship_context_id
      ) {
        throw new Error(
          "The source still needs identity review before a person page can open.",
        );
      }
      const receipts = [...payload.receipts];
      if (identityClueConfirmed && parsedIdentityClue) {
        handleRequestIdRef.current ??= crypto.randomUUID();
        const handleResponse = await fetch(
          "/api/local-integration/resources",
          {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              request_id: handleRequestIdRef.current,
              scope_mode: "existing",
              person_id: first.identity.person_id,
              relationship_context_id:
                first.identity.relationship_context_id,
              type: "contact",
              value: identityClue.trim(),
              identity_clue_confirmed: true,
            }),
          },
        );
        const handlePayload = (await handleResponse.json()) as
          | { receipts: ResourceCaptureResponse[] }
          | { message?: string };
        if (
          !handleResponse.ok ||
          !("receipts" in handlePayload)
        ) {
          throw new Error(
            "The relationship source was saved, but the confirmed identity clue was not. Review the clue and retry to finish.",
          );
        }
        receipts.push(...handlePayload.receipts);
      }
      const personLabel =
        target.mode === "new_person"
          ? name.trim()
          : target.person.display_label;
      const savedContextLabel =
        target.mode === "existing_context"
          ? target.relationshipContext.display_label
          : contextLabel.trim();
      onCommitted(
        {
          contract_version: first.contract_version,
          person: {
            id: first.identity.person_id,
            display_label: personLabel,
          },
          relationship_context: {
            id: first.identity.relationship_context_id,
            display_label: savedContextLabel,
          },
        },
        receipts,
        agentPersonOutcome(target),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The relationship source could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deferIdentityReview() {
    if (!reviewReady) {
      setError(
        "Add the intended relationship context and first source before saving this identity review.",
      );
      return;
    }
    requestIdRef.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/local-integration/resources", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestIdRef.current,
          scope_mode: "identity_candidates",
          candidate_person_ids: matches.map((person) => person.id),
          contact_name: name.trim(),
          relationship_context_label: contextLabel.trim(),
          type: "note",
          title: "Recruiter source awaiting identity",
          value: firstNote.trim(),
        }),
      });
      const payload = (await response.json()) as
        | { receipts: ResourceCaptureResponse[] }
        | { message?: string };
      if (!response.ok || !("receipts" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The unresolved source could not be saved.",
        );
      }
      const caseId =
        payload.receipts[0]?.identity.resolution_case_id ?? null;
      if (!caseId) {
        throw new Error(
          "The source was saved without a resumable identity review case.",
        );
      }
      onDeferred(caseId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The unresolved source could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="agent-create-title"
      className="context-agent-create"
    >
      <header>
        <span>
          <UserPlus aria-hidden="true" size={16} />
        </span>
        <div>
          <strong id="agent-create-title">
            Resolve the person before creating
          </strong>
          <p>
            Find an existing identity first, then bind one relationship and
            source.
          </p>
        </div>
        <button
          aria-label="Cancel person draft"
          className="context-icon-button"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={15} />
        </button>
      </header>
      {error ? <p className="context-agent-create__error">{error}</p> : null}
      <label>
        <span>Person</span>
        <input
          autoComplete="off"
          maxLength={200}
          onChange={(event) => {
            const nextName = event.target.value;
            setName(nextName);
            setIdentityClueConfirmed(false);
            setMatches([]);
            setLookupState(
              nextName.normalize("NFKC").trim() ||
                identityClue.normalize("NFKC").trim()
                ? "loading"
                : "idle",
            );
            setTarget({ mode: "new_person" });
            setDifferentPersonConfirmed(false);
            requestIdRef.current = null;
            handleRequestIdRef.current = null;
          }}
          placeholder="e.g. 陈雅宁"
          value={name}
        />
      </label>
      <label>
        <span>
          Known identity clue <small>Optional</small>
        </span>
        <input
          autoComplete="off"
          maxLength={500}
          onChange={(event) => {
            const nextClue = event.target.value;
            setIdentityClue(nextClue);
            setIdentityClueConfirmed(false);
            setMatches([]);
            setLookupState(
              name.normalize("NFKC").trim() ||
                nextClue.normalize("NFKC").trim()
                ? "loading"
                : "idle",
            );
            setTarget({ mode: "new_person" });
            setDifferentPersonConfirmed(false);
            requestIdRef.current = null;
            handleRequestIdRef.current = null;
          }}
          placeholder="Email, phone, LinkedIn URL, or wechat:ID"
          value={identityClue}
        />
        <small>
          Used only for account-scoped lookup. Raw values are not returned in
          results.
        </small>
      </label>
      {identityClue.trim() && !parsedIdentityClue ? (
        <p className="context-agent-create__error">
          Use an email, phone, public profile URL, or an explicit
          “wechat:ID”.
        </p>
      ) : null}
      <div
        className="context-agent-identity-check"
        data-state={lookupState}
      >
        <header>
          <span>Identity check</span>
          <i>
            {lookupState === "loading"
              ? "Checking"
              : lookupState === "ready"
                ? `${matches.length} possible`
                : lookupState === "error"
                  ? "Unavailable"
                  : "Required"}
          </i>
        </header>
        {lookupState === "idle" ? (
          <p>
            Enter a name or known identity clue before choosing new or
            existing.
          </p>
        ) : lookupState === "loading" ? (
          <p>
            <CircleNotch aria-hidden="true" className="spin" size={13} />
            Looking only inside this recruiter account.
          </p>
        ) : lookupState === "error" ? (
          <div className="context-agent-identity-error">
            <p>
              Existing people could not be checked. New identity creation is
              paused.
            </p>
            <button
              className="context-secondary-button"
              onClick={() => {
                setLookupState("loading");
                setLookupRevision((value) => value + 1);
              }}
              type="button"
            >
              Retry identity check
            </button>
          </div>
        ) : matches.length > 0 ? (
          <div className="context-agent-person-matches">
            <p>
              Confirmed handles are current identity evidence. Expired handles
              remain review clues only; you still make the binding.
            </p>
            {matches.map((person) => {
              const temporalRole =
                personIdentityTemporalRole(person);
              const selectable =
                canSelectPersonForIdentityClue(person, matches);
              return (
                <article
                  data-selectable={selectable}
                  data-selected={
                    target.mode !== "new_person" &&
                    target.person.id === person.id
                  }
                  data-temporal-role={temporalRole}
                  key={person.id}
                >
                <header>
                  <span>{initials(person.display_label)}</span>
                  <p>
                    <strong>{person.display_label}</strong>
                    <small>
                      {person.context_count}{" "}
                      {person.context_count === 1
                        ? "relationship"
                        : "relationships"}{" "}
                      · {person.capture_count} sources
                    </small>
                  </p>
                  <i className="context-agent-temporal-status">
                    {temporalRole === "current" ? (
                      <>
                        <ShieldCheck aria-hidden="true" size={12} />
                        Current clue
                      </>
                    ) : temporalRole === "historical" ? (
                      <>
                        <Clock aria-hidden="true" size={12} />
                        Historical clue
                      </>
                    ) : (
                      "Name only"
                    )}
                  </i>
                </header>
                <ul
                  aria-label={`Why ${person.display_label} matched`}
                  className="context-agent-match-reasons"
                >
                  {person.identity_matches.map((match) => (
                    <li
                      data-kind={match.kind}
                      key={
                        match.kind === "name"
                          ? "name"
                          : `${match.handle_type}:${match.display_hint}`
                      }
                    >
                      {match.kind === "name" ? (
                        <>Name match only</>
                      ) : match.kind === "expired_handle" ? (
                        <>
                          <Clock aria-hidden="true" size={12} />
                          Expired{" "}
                          {identityHandleLabel(match.handle_type)} ·{" "}
                          {match.display_hint} · needs a fresh source
                        </>
                      ) : (
                        <>
                          <ShieldCheck
                            aria-hidden="true"
                            size={12}
                          />
                          Confirmed{" "}
                          {identityHandleLabel(match.handle_type)} ·{" "}
                          {match.display_hint}
                          {match.source_resource_id
                            ? " · source-linked"
                            : ""}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {temporalRole !== "name_only" ? (
                  <p className="context-agent-temporal-note">
                    {selectable
                      ? temporalRole === "current"
                        ? "Current source-linked authority. A new source can attach here after your explicit choice."
                        : "No current owner exists. This historical clue may be reconfirmed only from the fresh source and your explicit choice."
                      : "Visible for comparison only. It cannot receive this source while another person holds current authority."}
                  </p>
                ) : null}
                <div>
                  {agentRelationshipContexts(person).map((context) => (
                    <button
                      data-active={
                        target.mode === "existing_context" &&
                        target.relationshipContext.id === context.id
                      }
                      disabled={!selectable}
                      key={context.id}
                      onClick={() => {
                        setTarget({
                          mode: "existing_context",
                          person,
                          relationshipContext: context,
                        });
                        setName(person.display_label);
                        setContextLabel(context.display_label);
                        setDifferentPersonConfirmed(false);
                        requestIdRef.current = null;
                        handleRequestIdRef.current = null;
                      }}
                      type="button"
                    >
                      <CheckCircle aria-hidden="true" size={13} />
                      {context.display_label}
                    </button>
                  ))}
                  <button
                    data-active={
                      target.mode === "existing_person_new_context" &&
                      target.person.id === person.id
                    }
                    disabled={!selectable}
                    onClick={() => {
                      setTarget({
                        mode: "existing_person_new_context",
                        person,
                      });
                      setName(person.display_label);
                      setDifferentPersonConfirmed(false);
                      requestIdRef.current = null;
                      handleRequestIdRef.current = null;
                    }}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={13} />
                    New relationship
                  </button>
                </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p>
            No existing person matched the supplied name or confirmed identity
            clue. Creating a new identity is available.
          </p>
        )}
        {lookupState === "ready" &&
        (exactMatches.length > 0 || expiredHandleMatches.length > 0) &&
        confirmedHandleMatches.length === 0 &&
        target.mode === "new_person" ? (
          <label className="context-agent-distinct-person">
            <input
              checked={differentPersonConfirmed}
              onChange={(event) => {
                setDifferentPersonConfirmed(event.target.checked);
                requestIdRef.current = null;
                handleRequestIdRef.current = null;
              }}
              type="checkbox"
            />
            <span>
              This is a different person from the existing identity clue
              <small>
                {expiredHandleMatches.length > 0
                  ? "Required because this clue had a prior owner but is no longer current."
                  : "Required because an exact account-scoped name already exists."}
              </small>
            </span>
          </label>
        ) : null}
        {lookupState === "ready" &&
        confirmedHandleMatches.length > 0 &&
        target.mode === "new_person" ? (
          <div
            className="context-agent-handle-owner"
            role="note"
          >
            <ShieldCheck aria-hidden="true" size={15} />
            <p>
              <strong>
                Current owner:{" "}
                {confirmedHandleMatches
                  .map((person) => person.display_label)
                  .join(", ")}
              </strong>
              <small>
                Choose the current person, remove the clue, or keep this
                source unresolved. Historical owners stay visible for
                comparison but cannot receive the source.
              </small>
            </p>
          </div>
        ) : null}
        {lookupState === "ready" &&
        matches.length > 0 &&
        confirmedHandleMatches.length === 0 &&
        target.mode !== "new_person" ? (
          <button
            className="context-agent-create-distinct"
            onClick={() => {
              setTarget({ mode: "new_person" });
              setContextLabel("");
              setDifferentPersonConfirmed(false);
              requestIdRef.current = null;
              handleRequestIdRef.current = null;
            }}
            type="button"
          >
            Create a different person instead
          </button>
        ) : null}
      </div>
      {parsedIdentityClue && maskedIdentityClue ? (
        <label className="context-agent-distinct-person">
          <input
            checked={identityClueConfirmed}
            disabled={
              lookupState !== "ready" || identityChoiceNeedsReview
            }
            onChange={(event) => {
              setIdentityClueConfirmed(event.target.checked);
              handleRequestIdRef.current = null;
            }}
            type="checkbox"
          />
          <span>
            Save {maskedIdentityClue} as a confirmed{" "}
            {identityHandleLabel(parsedIdentityClue.type)} clue
            <small>
              {identityChoiceNeedsReview
                ? "Choose the identity before confirming this clue."
                : "Stores a hash, masked hint, governed source, and review deadline, not the raw value. Email, phone, and WeChat clues are reviewed annually."}
            </small>
          </span>
        </label>
      ) : null}
      <label>
        <span>Relationship context</span>
        <input
          autoComplete="off"
          disabled={target.mode === "existing_context"}
          maxLength={200}
          onChange={(event) => {
            setContextLabel(event.target.value);
            requestIdRef.current = null;
            handleRequestIdRef.current = null;
          }}
          placeholder="e.g. VP Product search"
          value={contextLabel}
        />
      </label>
      <label>
        <span>First source</span>
        <textarea
          maxLength={8_000}
          onChange={(event) => {
            setFirstNote(event.target.value);
            requestIdRef.current = null;
          }}
          placeholder="Paste the recruiter-owned note that justifies creating this relationship."
          rows={3}
          value={firstNote}
        />
      </label>
      <footer>
        <p>
          {target.mode === "existing_context"
            ? "This attaches the note to the selected existing relationship."
            : target.mode === "existing_person_new_context"
              ? "This keeps the existing person and creates only a separate relationship context."
              : "This creates a distinct person only after the account-scoped identity check."}{" "}
          It never merges or contacts anyone.
        </p>
        <div className="context-agent-create__footer-actions">
          {reviewReady ? (
            <button
              className="context-secondary-button"
              disabled={busy}
              onClick={() => void deferIdentityReview()}
              type="button"
            >
              Save for identity review
            </button>
          ) : null}
          <button
            className="context-primary-button context-primary-button--compact"
            disabled={!ready || busy}
            onClick={() => void commitPersonSource()}
            type="button"
          >
            {busy ? (
              <CircleNotch aria-hidden="true" className="spin" size={16} />
            ) : (
              <ArrowRight aria-hidden="true" size={16} />
            )}
            {busy
              ? "Saving"
              : target.mode === "existing_context"
                ? "Attach source"
                : target.mode === "existing_person_new_context"
                  ? "Add relationship"
                  : "Create new person"}
          </button>
        </div>
      </footer>
    </section>
  );
}

function ExternalEffectReview({
  history,
}: {
  history: RelationshipAgentHistory | null;
}) {
  const followUps = history?.external_effect_follow_ups ?? [];
  if (followUps.length === 0) {
    return null;
  }
  const unresolvedCount = followUps.filter(
    (followUp) =>
      followUp.action_status === "unknown" ||
      followUp.action_status === "executing",
  ).length;
  return (
    <section
      aria-labelledby="external-effect-review-title"
      className="context-effect-review"
      id="external-effect-review"
    >
      <header className="context-effect-review__heading">
        <div>
          <p className="eyebrow">EXTERNAL EFFECT REVIEW</p>
          <h2 id="external-effect-review-title">
            Check what happened outside Talent Signal.
          </h2>
          <p>
            Source authorization ended after these effects were attempted.
            The records remain visible because authorization loss cannot undo
            something that may already exist elsewhere.
          </p>
        </div>
        <span data-has-unresolved={unresolvedCount > 0}>
          <Warning aria-hidden="true" size={16} />
          {unresolvedCount > 0
            ? `${unresolvedCount} ${
                unresolvedCount === 1 ? "result" : "results"
              } unresolved`
            : "Review complete"}
        </span>
      </header>
      <div className="context-effect-review__list">
        {followUps.map((followUp) => {
          const unresolved =
            followUp.action_status === "unknown" ||
            followUp.action_status === "executing";
          const resultLabel = unresolved
            ? followUp.action_status === "unknown"
              ? "Result unknown"
              : "Still executing"
            : followUp.outcome?.status === "verified"
              ? "Completed · verified"
              : "Completed · result recorded";
          const latestEvidence = followUp.outcome
            ? followUp.outcome.summary
            : followUp.observation
              ? `Destination observation was ${followUp.observation.match_status}.`
              : followUp.attempt
                ? `Latest attempt remains ${followUp.attempt.status}.`
                : "No external observation is recorded.";
          return (
            <article
              data-state={unresolved ? "unresolved" : "completed"}
              key={followUp.action_id}
            >
              <header>
                <span>{resultLabel}</span>
                <time dateTime={followUp.authorization.changed_at}>
                  Authorization {followUp.authorization.state}{" "}
                  {formatDate(followUp.authorization.changed_at)}
                </time>
              </header>
              <h3>
                {followUp.target ??
                  followUp.action_type.replaceAll("_", " ")}
              </h3>
              {followUp.reason ? <p>{followUp.reason}</p> : null}
              <div className="context-effect-review__decision">
                {unresolved ? (
                  <Warning aria-hidden="true" size={17} />
                ) : (
                  <CheckCircle aria-hidden="true" size={17} />
                )}
                <p>
                  <strong>
                    {unresolved
                      ? "Reconcile before retrying."
                      : "Recorded, not represented as undone."}
                  </strong>
                  <span>
                    {unresolved
                      ? "Check the real destination first. No observation means the system cannot safely call this failed or completed."
                      : "The external result remains part of history even though its source can no longer authorize future work."}
                  </span>
                </p>
              </div>
              <dl>
                <div>
                  <dt>Destination</dt>
                  <dd>
                    {followUp.destination_key ??
                      "No destination recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Latest evidence</dt>
                  <dd>{latestEvidence}</dd>
                </div>
                <div>
                  <dt>Attempt</dt>
                  <dd>
                    {followUp.attempt
                      ? `${followUp.attempt.status} · ${formatDate(
                          followUp.attempt.started_at,
                        )}`
                      : "No attempt record"}
                  </dd>
                </div>
              </dl>
              <footer>
                <ShieldCheck aria-hidden="true" size={14} />
                Nothing will contact the person or change the destination
                without a new recruiter decision.
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AgentHistory({
  history,
  onReviewMerge,
}: {
  history: RelationshipAgentHistory | null;
  onReviewMerge: (operationId: string) => void;
}) {
  const followUps = history?.external_effect_follow_ups ?? [];
  if (
    !history ||
    (history.operations.length === 0 && followUps.length === 0)
  ) {
    return null;
  }
  const latest = history.operations[0];
  return (
    <details className="context-agent-history">
      <summary>
        {followUps.length > 0 ? (
          <Warning aria-hidden="true" size={15} />
        ) : (
          <Clock aria-hidden="true" size={15} />
        )}
        <span>
          <strong>Relationship history</strong>
          <small>
            {followUps.length > 0
              ? `${followUps.length} preserved external ${
                  followUps.length === 1 ? "effect needs" : "effects need"
                } your review`
              : latest
                ? `${latest.title} · ${formatDate(latest.occurred_at)}`
                : "Governed operations"}
          </small>
        </span>
        <i>{history.operations.length + followUps.length}</i>
      </summary>
      {followUps.length > 0 ? (
        <a
          className="context-agent-follow-up-link"
          href="#external-effect-review"
        >
          <span>
            <Warning aria-hidden="true" size={15} />
          </span>
          <p>
            <strong>Review preserved external effects</strong>
            <small>
              Compare destination evidence on the living person page.
            </small>
          </p>
          <ArrowRight aria-hidden="true" size={15} />
        </a>
      ) : null}
      <ol>
        {history.operations.slice(0, 12).map((operation) => (
          <li data-status={operation.status} key={operation.id}>
            <span aria-hidden="true" />
            <article>
              <header>
                <strong>{operation.title}</strong>
                <time dateTime={operation.occurred_at}>
                  {formatDate(operation.occurred_at)}
                </time>
              </header>
              <p>{operation.detail}</p>
              <footer>
                <span>{operation.status.replaceAll("_", " ")}</span>
                <span>
                  {operation.actor_kind === "recruiter"
                    ? "Recruiter decision"
                    : "System projection"}
                </span>
                {operation.references.knowledge_snapshot_id ? (
                  <span>
                    Snapshot{" "}
                    {operation.references.knowledge_snapshot_id.slice(
                      0,
                      8,
                    )}
                  </span>
                ) : null}
                {operation.kind === "identity_merge" &&
                operation.status === "completed" &&
                operation.provenance.event_type ===
                  "identity.people_merged" &&
                operation.references.person_merge_operation_id ? (
                  <button
                    onClick={() =>
                      onReviewMerge(
                        operation.references
                          .person_merge_operation_id as string,
                      )
                    }
                    type="button"
                  >
                    Review reversal
                    <ArrowRight aria-hidden="true" size={13} />
                  </button>
                ) : null}
              </footer>
            </article>
          </li>
        ))}
      </ol>
      {history.operations.length > 12 ? (
        <p>
          Showing the latest 12 of {history.operations.length} governed
          operations.
        </p>
      ) : null}
    </details>
  );
}

function PersonMergeReview({
  currentPerson,
  forceOpen,
  onCloseRequest,
  onMutation,
  reversalPreview,
}: {
  currentPerson: RelationshipScope["person"];
  forceOpen: boolean;
  onCloseRequest: () => void;
  onMutation: (
    response: PersonMergeWorkflowResponse,
    sourceLabel: string,
  ) => void;
  reversalPreview: PersonMergeReversalPreview | null;
}) {
  const mergeRequestRef = useRef<string | null>(null);
  const reversalRequestRef = useRef<string | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<PersonDirectoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [preview, setPreview] = useState<PersonMergePreview | null>(null);
  const [result, setResult] =
    useState<PersonMergeWorkflowResponse | null>(null);
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalReviewed, setReversalReviewed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const visible = open || forceOpen;

  useEffect(() => {
    if (!visible || reversalPreview || people.length > 0) {
      return;
    }
    const controller = new AbortController();
    void fetch("/api/local-integration/people", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as
          | { people: PersonDirectoryItem[] }
          | { message?: string };
        if (!response.ok || !("people" in payload)) {
          throw new Error(
            "message" in payload && payload.message
              ? payload.message
              : "People could not be loaded for duplicate review.",
          );
        }
        setPeople(
          payload.people.filter(
            (person) => person.id !== currentPerson.id,
          ),
        );
      })
      .catch((caught: unknown) => {
        if (
          caught instanceof DOMException &&
          caught.name === "AbortError"
        ) {
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "People could not be loaded for duplicate review.",
        );
      });
    return () => controller.abort();
  }, [currentPerson.id, people.length, reversalPreview, visible]);

  const matchingPeople = useMemo(() => {
    const normalized = query.normalize("NFKC").trim().toLowerCase();
    return people
      .filter(
        (person) =>
          !normalized ||
          person.display_label
            .normalize("NFKC")
            .toLowerCase()
            .includes(normalized) ||
          person.contexts.some((context) =>
            context.display_label
              .normalize("NFKC")
              .toLowerCase()
              .includes(normalized),
          ),
      )
      .slice(0, 8);
  }, [people, query]);
  const selectedPerson =
    people.find((person) => person.id === selectedPersonId) ?? null;
  const compilationFailures =
    result?.compilations.filter(
      (compilation) => compilation.status === "failed",
    ) ?? [];

  async function searchPeople(value: string) {
    setQuery(value);
    const normalized = value.normalize("NFKC").trim();
    if (normalized.length < 2) {
      return;
    }
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    try {
      const response = await fetch(
        "/api/local-integration/people/search",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: normalized }),
          signal: controller.signal,
        },
      );
      const payload = (await response.json()) as
        | { people: PersonDirectoryItem[] }
        | { message?: string };
      if (!response.ok || !("people" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The people directory search could not be completed.",
        );
      }
      setPeople(
        payload.people.filter(
          (person) => person.id !== currentPerson.id,
        ),
      );
    } catch (caught) {
      if (
        caught instanceof DOMException &&
        caught.name === "AbortError"
      ) {
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "The people directory search could not be completed.",
      );
    }
  }

  async function choosePerson(person: PersonDirectoryItem) {
    setSelectedPersonId(person.id);
    setPreview(null);
    setResult(null);
    setReason("");
    setReviewed(false);
    setError("");
    mergeRequestRef.current = null;
    setBusy("Comparing evidence");
    try {
      const parameters = new URLSearchParams({
        source_person_id: person.id,
        target_person_id: currentPerson.id,
      });
      const response = await fetch(
        `/api/local-integration/person-merges?${parameters.toString()}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | PersonMergePreview
        | { message?: string };
      if (!response.ok || !("preview_digest" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The duplicate review could not be prepared.",
        );
      }
      setPreview(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The duplicate review could not be prepared.",
      );
    } finally {
      setBusy("");
    }
  }

  async function applyMerge() {
    if (
      !preview ||
      !selectedPerson ||
      preview.blockers.length > 0 ||
      !reviewed ||
      !reason.trim()
    ) {
      setError(
        "Review the evidence differences and record why these pages represent one person.",
      );
      return;
    }
    mergeRequestRef.current ??= crypto.randomUUID();
    setBusy("Merging people");
    setError("");
    try {
      const response = await fetch(
        "/api/local-integration/person-merges",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: mergeRequestRef.current,
            source_person_id: preview.source_person.id,
            target_person_id: preview.target_person.id,
            expected_source_version: preview.source_person.version,
            expected_target_version: preview.target_person.version,
            expected_preview_digest: preview.preview_digest,
            decision: "merge_people",
            reason: reason.trim(),
          }),
        },
      );
      const payload = (await response.json()) as
        | PersonMergeWorkflowResponse
        | { message?: string };
      if (!response.ok || !("operation_id" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The person merge was not applied.",
        );
      }
      setResult(payload);
      onMutation(payload, selectedPerson.display_label);
    } catch (caught) {
      mergeRequestRef.current = null;
      setError(
        caught instanceof Error
          ? caught.message
          : "The person merge was not applied.",
      );
    } finally {
      setBusy("");
    }
  }

  async function reverseMerge() {
    const operationId =
      result?.status === "applied"
        ? result.operation_id
        : reversalPreview?.reversal_available
          ? reversalPreview.operation_id
          : null;
    if (
      !operationId ||
      !reversalReviewed ||
      !reversalReason.trim()
    ) {
      setError(
        "Confirm the relationship split and record why the merge should be reversed.",
      );
      return;
    }
    reversalRequestRef.current ??= crypto.randomUUID();
    setBusy("Reversing merge");
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/person-merges/${operationId}/reversal`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: reversalRequestRef.current,
            decision: "reverse_person_merge",
            reason: reversalReason.trim(),
          }),
        },
      );
      const payload = (await response.json()) as
        | PersonMergeWorkflowResponse
        | { message?: string };
      if (!response.ok || !("operation_id" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The person merge could not be reversed.",
        );
      }
      setResult(payload);
      onMutation(
        payload,
        selectedPerson?.display_label ??
          preview?.source_person.display_label ??
          reversalPreview?.source_person.display_label ??
          "The prior person",
      );
    } catch (caught) {
      reversalRequestRef.current = null;
      setError(
        caught instanceof Error
          ? caught.message
          : "The person merge could not be reversed.",
      );
    } finally {
      setBusy("");
    }
  }

  function closeReview() {
    setOpen(false);
    onCloseRequest();
    searchControllerRef.current?.abort();
    setQuery("");
    setSelectedPersonId("");
    setPreview(null);
    setResult(null);
    setReason("");
    setReviewed(false);
    setReversalReason("");
    setReversalReviewed(false);
    setError("");
    mergeRequestRef.current = null;
    reversalRequestRef.current = null;
  }

  if (!visible) {
    return (
      <section className="context-person-merge context-person-merge--closed">
        <span>
          <UserPlus aria-hidden="true" size={17} />
        </span>
        <p>
          <strong>Possible duplicate?</strong>
          <small>
            Compare identity evidence before combining relationship memory.
          </small>
        </p>
        <button
          className="context-secondary-button"
          onClick={() => setOpen(true)}
          type="button"
        >
          Review duplicate
        </button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="person-merge-title"
      className="context-person-merge"
      id="person-merge-review"
    >
      <header className="context-person-merge__heading">
        <div>
          <p className="eyebrow">
            {reversalPreview
              ? "IDENTITY RECOVERY"
              : "IDENTITY MAINTENANCE"}
          </p>
          <h2 id="person-merge-title">
            {reversalPreview
              ? "Review a prior person merge"
              : "Review a possible duplicate"}
          </h2>
          {reversalPreview ? (
            <p>
              Recheck the current relationship state before restoring{" "}
              {reversalPreview.source_person.display_label} as a separate
              person. History alone never authorizes the split.
            </p>
          ) : (
            <p>
              Keep {currentPerson.display_label} as the stable page. The
              selected page, its relationship contexts, and governed sources
              move here only after your confirmation.
            </p>
          )}
        </div>
        <button
          aria-label="Close duplicate review"
          className="context-icon-button"
          disabled={Boolean(busy)}
          onClick={closeReview}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </header>

      {!result ? reversalPreview ? (
        <div className="context-person-merge__preview context-person-merge__reversal">
          <div className="context-person-merge__direction">
            <article data-target="true">
              <span>Current retained page</span>
              <strong>
                {reversalPreview.target_person.display_label}
              </strong>
              <small>Current person and old-link destination</small>
            </article>
            <ArrowRight aria-hidden="true" size={19} />
            <article>
              <span>Restore separately</span>
              <strong>
                {reversalPreview.source_person.display_label}
              </strong>
              <small>
                {reversalPreview.contexts_to_restore.length} relationship{" "}
                {reversalPreview.contexts_to_restore.length === 1
                  ? "context"
                  : "contexts"}
              </small>
            </article>
          </div>

          <div className="context-person-merge__inventory">
            <article>
              <span>Relationship ownership to restore</span>
              <ul>
                {reversalPreview.contexts_to_restore.map((context) => (
                  <li key={context.id}>
                    <span>{context.display_label}</span>
                    <small>
                      {context.active_capture_count}{" "}
                      {context.active_capture_count === 1
                        ? "source"
                        : "sources"}{" "}
                      · {context.active_fact_count} confirmed facts
                    </small>
                  </li>
                ))}
              </ul>
            </article>
            <article>
              <span>Original recruiter decision</span>
              <strong>
                Merged {formatDate(reversalPreview.decided_at)}
              </strong>
              <p>{reversalPreview.original_reason}</p>
              <p>
                Operation {reversalPreview.operation_id.slice(0, 8)} ·{" "}
                current status {reversalPreview.status}
              </p>
            </article>
          </div>

          {reversalPreview.blockers.length > 0 ? (
            <div
              className="context-person-merge__blockers"
              role="alert"
            >
              <Warning aria-hidden="true" size={18} />
              <div>
                <strong>Automatic reversal paused</strong>
                {reversalPreview.blockers.map((blocker) => (
                  <p key={blocker.code}>
                    {blocker.message} ({blocker.count})
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="context-person-merge__decision">
              <label htmlFor="person-merge-history-reversal-reason">
                Why should these people be separate now?
              </label>
              <textarea
                id="person-merge-history-reversal-reason"
                onChange={(event) => {
                  setReversalReason(event.target.value);
                  reversalRequestRef.current = null;
                }}
                placeholder="Record the recruiter-observed correction basis."
                rows={3}
                value={reversalReason}
              />
              <label className="context-person-merge__check">
                <input
                  checked={reversalReviewed}
                  onChange={(event) =>
                    setReversalReviewed(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  I reviewed the current relationship ownership and the
                  original merge basis. Restore{" "}
                  {reversalPreview.source_person.display_label} only as the
                  separate person recorded by this operation.
                </span>
              </label>
              <button
                className="context-secondary-button"
                disabled={
                  Boolean(busy) ||
                  !reversalReviewed ||
                  !reversalReason.trim()
                }
                onClick={() => void reverseMerge()}
                type="button"
              >
                {busy === "Reversing merge" ? (
                  <CircleNotch
                    aria-hidden="true"
                    className="context-spin"
                    size={17}
                  />
                ) : (
                  <Prohibit aria-hidden="true" size={17} />
                )}
                Restore separate pages
              </button>
              <small>
                This rechecks canonical state at execution time and performs no
                external write.
              </small>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="context-person-merge__picker">
            <label htmlFor="person-merge-query">
              Find the page that may be a duplicate
            </label>
            <input
              autoComplete="off"
              id="person-merge-query"
              onChange={(event) =>
                void searchPeople(event.target.value)
              }
              placeholder="Name or relationship context"
              type="search"
              value={query}
            />
            <div className="context-person-merge__people">
              {matchingPeople.map((person) => (
                <button
                  aria-pressed={selectedPersonId === person.id}
                  data-selected={selectedPersonId === person.id}
                  disabled={Boolean(busy)}
                  key={person.id}
                  onClick={() => void choosePerson(person)}
                  type="button"
                >
                  <span aria-hidden="true">
                    {person.display_label.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <p>
                    <strong>{person.display_label}</strong>
                    <small>
                      {person.context_count} relationship{" "}
                      {person.context_count === 1 ? "context" : "contexts"} ·{" "}
                      {person.capture_count} governed{" "}
                      {person.capture_count === 1 ? "source" : "sources"}
                    </small>
                  </p>
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              ))}
              {!busy && matchingPeople.length === 0 ? (
                <p>No other active person pages match this search.</p>
              ) : null}
            </div>
          </div>

          {preview ? (
            <div className="context-person-merge__preview">
              <div className="context-person-merge__direction">
                <article>
                  <span>Fold in</span>
                  <strong>{preview.source_person.display_label}</strong>
                  <small>
                    {preview.contexts_to_move.length} relationship{" "}
                    {preview.contexts_to_move.length === 1
                      ? "context"
                      : "contexts"}
                  </small>
                </article>
                <ArrowRight aria-hidden="true" size={19} />
                <article data-target="true">
                  <span>Retain</span>
                  <strong>{preview.target_person.display_label}</strong>
                  <small>URL and person identity stay stable</small>
                </article>
              </div>

              <div className="context-person-merge__inventory">
                <article>
                  <span>Relationship memory moving</span>
                  <strong>
                    {preview.active_capture_count} governed sources ·{" "}
                    {preview.active_identity_handle_count} identity clues
                  </strong>
                  <ul>
                    {preview.contexts_to_move.map((context) => (
                      <li key={context.id}>
                        <span>{context.display_label}</span>
                        <small>
                          {context.active_capture_count}{" "}
                          {context.active_capture_count === 1
                            ? "source"
                            : "sources"}{" "}
                          ·{" "}
                          {context.active_fact_count} confirmed facts
                        </small>
                      </li>
                    ))}
                  </ul>
                </article>
                <article>
                  <span>Differences to review</span>
                  {preview.review_items.length > 0 ? (
                    <ul>
                      {preview.review_items.map((item, index) => (
                        <li key={`${item.kind}:${index}`}>
                          <span>{item.title}</span>
                          <small>
                            {item.detail} · {item.evidence_ids.length} evidence{" "}
                            {item.evidence_ids.length === 1
                              ? "reference"
                              : "references"}
                          </small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No conflicting labels, contextual facts, or confirmed
                      identity clues were found.
                    </p>
                  )}
                </article>
              </div>

              {preview.blockers.length > 0 ? (
                <div
                  className="context-person-merge__blockers"
                  role="alert"
                >
                  <Warning aria-hidden="true" size={18} />
                  <div>
                    <strong>Merge paused</strong>
                    {preview.blockers.map((blocker) => (
                      <p key={blocker.code}>
                        {blocker.message} ({blocker.count})
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="context-person-merge__decision">
                  <label htmlFor="person-merge-reason">
                    Why do these pages represent one person?
                  </label>
                  <textarea
                    id="person-merge-reason"
                    onChange={(event) => {
                      setReason(event.target.value);
                      mergeRequestRef.current = null;
                    }}
                    placeholder="Record the recruiter-observed identity basis."
                    rows={3}
                    value={reason}
                  />
                  <label className="context-person-merge__check">
                    <input
                      checked={reviewed}
                      onChange={(event) =>
                        setReviewed(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>
                      I reviewed the labels, relationship contexts, source
                      counts, and identity differences above. Keep{" "}
                      {currentPerson.display_label} as the stable page.
                    </span>
                  </label>
                  <button
                    className="context-primary-button"
                    disabled={
                      Boolean(busy) || !reviewed || !reason.trim()
                    }
                    onClick={() => void applyMerge()}
                    type="button"
                  >
                    {busy === "Merging people" ? (
                      <CircleNotch
                        aria-hidden="true"
                        className="context-spin"
                        size={17}
                      />
                    ) : (
                      <UserPlus aria-hidden="true" size={17} />
                    )}
                    Merge into {currentPerson.display_label}
                  </button>
                  <small>
                    This changes internal identity and Wiki memory only. It
                    sends no message and performs no external write.
                  </small>
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <div className="context-person-merge__receipt">
          <div data-status={result.status}>
            {result.status === "applied" ? (
              <CheckCircle aria-hidden="true" size={22} weight="fill" />
            ) : (
              <AddressBook aria-hidden="true" size={22} />
            )}
            <p>
              <strong>
                {result.status === "applied"
                  ? "One living person page retained"
                  : "Separate person pages restored"}
              </strong>
              <small>
                Operation {result.operation_id.slice(0, 8)} ·{" "}
                {result.affected_relationship_context_ids.length} contexts ·{" "}
                {result.captures_rebound} governed sources
              </small>
            </p>
          </div>
          <p>
            {result.compilations.length - compilationFailures.length} of{" "}
            {result.compilations.length} relationship Wikis recompiled
            successfully.
            {compilationFailures.length > 0
              ? ` ${compilationFailures.length} need a safe retry; source ownership is already preserved.`
              : ""}
          </p>

          {result.status === "applied" && result.reversal_available ? (
            <details>
              <summary>Undo this merge</summary>
              <p>
                Reversal restores the prior person and relationship ownership.
                It stops if new evidence now depends on a moved context.
              </p>
              <label htmlFor="person-merge-reversal-reason">
                Why should these people be separate?
              </label>
              <textarea
                id="person-merge-reversal-reason"
                onChange={(event) => {
                  setReversalReason(event.target.value);
                  reversalRequestRef.current = null;
                }}
                rows={3}
                value={reversalReason}
              />
              <label className="context-person-merge__check">
                <input
                  checked={reversalReviewed}
                  onChange={(event) =>
                    setReversalReviewed(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  I reviewed the split and understand that the earlier person
                  page and its relationship contexts will return.
                </span>
              </label>
              <button
                className="context-secondary-button"
                disabled={
                  Boolean(busy) ||
                  !reversalReviewed ||
                  !reversalReason.trim()
                }
                onClick={() => void reverseMerge()}
                type="button"
              >
                {busy === "Reversing merge" ? (
                  <CircleNotch
                    aria-hidden="true"
                    className="context-spin"
                    size={17}
                  />
                ) : (
                  <Prohibit aria-hidden="true" size={17} />
                )}
                Restore separate pages
              </button>
            </details>
          ) : (
            <button
              className="context-secondary-button"
              onClick={closeReview}
              type="button"
            >
              Done
            </button>
          )}
        </div>
      )}

      {busy && busy !== "Merging people" && busy !== "Reversing merge" ? (
        <p className="context-person-merge__progress" role="status">
          <CircleNotch
            aria-hidden="true"
            className="context-spin"
            size={15}
          />
          {busy}
        </p>
      ) : null}
      {error ? (
        <p className="context-person-merge__error" role="alert">
          <Warning aria-hidden="true" size={15} />
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function RelationshipWorkspaceApp({
  initialAgentHistory,
  initialIdentityResolutionCase,
  initialKnowledgeSnapshot,
  initialWorkspace,
  initialRelationshipScope,
  initialError,
  user,
}: Props) {
  const [agentHistory, setAgentHistory] = useState(initialAgentHistory);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [relationshipScope, setRelationshipScope] = useState(
    initialRelationshipScope,
  );
  const [identityResolutionCase, setIdentityResolutionCase] = useState(
    initialIdentityResolutionCase,
  );
  const [knowledgeSnapshot, setKnowledgeSnapshot] = useState(
    initialKnowledgeSnapshot,
  );
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [agentCreateOpen, setAgentCreateOpen] = useState(false);
  const [personMergeRequested, setPersonMergeRequested] = useState(false);
  const [personMergeReversalPreview, setPersonMergeReversalPreview] =
    useState<PersonMergeReversalPreview | null>(null);
  const [resourceComposerOpen, setResourceComposerOpen] = useState(false);
  const chatRequestRef = useRef<{
    objective: string;
    requestId: string;
  } | null>(null);
  const [chatObjective, setChatObjective] = useState(
    "What should I remember and do before the next conversation?",
  );
  const [submittedChatObjective, setSubmittedChatObjective] = useState("");
  const [chatResponse, setChatResponse] = useState<ChatTaskResponse | null>(
    null,
  );
  const [agentOperation, setAgentOperation] = useState<{
    detail: string;
    status: "completed" | "no_change" | "staged";
    title: string;
  } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [reversalPreview, setReversalPreview] =
    useState<EffectReversalPreview | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalReviewed, setReversalReviewed] = useState(false);
  const reversalApprovalRequestRef = useRef<string | null>(null);
  const [deletionSummary, setDeletionSummary] = useState<{
    derivatives: number;
    lineage: number;
  } | null>(null);
  const [announcement, setAnnouncement] = useState(
    initialIdentityResolutionCase
      ? "Identity review resumed."
      : initialWorkspace || initialRelationshipScope
      ? "Contact context loaded."
      : "No contact context is open.",
  );
  const activeScope = workspace
    ? {
        person: {
          id: workspace.subject.id,
          display_label: workspace.subject.display_label,
        },
        relationship_context: {
          id: workspace.assignment.id,
          display_label: workspace.assignment.display_label,
        },
      }
    : relationshipScope;
  const activeCaptureId = workspace?.capture.id ?? null;

  useEffect(() => {
    if (
      !activeCaptureId ||
      typeof window === "undefined" ||
      window.location.hash !== "#proposed-changes"
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById("proposed-changes");
      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCaptureId]);

  const assertions = workspace?.analysis.assertions ?? [];
  const pendingCount = assertions.filter(
    (assertion) => assertion.review_status === "pending",
  ).length;
  const confirmedCount = assertions.filter(
    (assertion) => assertion.review_status === "confirmed",
  ).length;
  const reviewedCount = assertions.filter((assertion) =>
    ["confirmed", "dismissed", "unresolved"].includes(
      assertion.review_status,
    ),
  ).length;
  const action = workspace?.analysis.action ?? null;
  const activeConfirmedStates =
    workspace?.confirmed_state.assertions.filter(
      (state) => state.state_status === "active",
    ) ?? [];
  const historicalConfirmedStates =
    workspace?.confirmed_state.assertions.filter(
      (state) => state.state_status !== "active",
    ) ?? [];
  const requiredFactsConfirmed =
    action !== null &&
    action.required_assertion_ids.every((id) =>
      assertions.some(
        (assertion) =>
          assertion.id === id && assertion.review_status === "confirmed",
      ),
  );
  const approval = workspace?.latest_approval ?? null;
  const effect = workspace?.latest_effect ?? null;
  const reversal = effect?.reversal ?? null;
  const reversalApproval = reversal?.latest_approval ?? null;
  const reversalAttempt = reversal?.latest_attempt ?? null;
  const sourceAuthorizationAvailable =
    workspace?.source_authorization.state === "authorized";
  const staleApprovalNeedsReview =
    action?.status === "proposed" &&
    approval?.status === "stale" &&
    effect === null;
  const canApproveCurrentAction =
    action?.status === "proposed" &&
    requiredFactsConfirmed &&
    effect === null &&
    (approval === null || approval.status === "stale");

  const evidenceById = useMemo(
    () =>
      new Map(
        (workspace?.capture.messages ?? []).map((message) => [
          message.id,
          message,
        ]),
      ),
    [workspace],
  );

  const timeline = useMemo(() => {
    if (!workspace) {
      return [];
    }
    const items = [
      {
        id: "capture",
        label: "Evidence captured",
        detail: `${workspace.capture.messages.length} reviewed messages`,
        time: workspace.capture.created_at,
        state: "source",
      },
      ...workspace.confirmed_state.assertions.map((state) => ({
        id: state.id,
        label:
          state.state_status === "active"
            ? `${fieldLabel(state.field)} confirmed`
            : `${fieldLabel(state.field)} ${state.state_status}`,
        detail: state.value,
        time: workspace.analysis.created_at,
        state: state.state_status,
      })),
    ];
    if (approval) {
      items.push({
        id: approval.id,
        label:
          approval.status === "active"
            ? "Next move approved"
            : `Approval ${approval.status}`,
        detail: `Action version ${approval.action_version}`,
        time: approval.granted_at,
        state: "approval",
      });
    }
    if (effect?.outcome) {
      items.push({
        id: effect.outcome.id,
        label:
          effect.outcome.status === "verified"
            ? "Outcome verified"
            : `Outcome ${effect.outcome.status}`,
        detail: effect.outcome.summary,
        time: effect.outcome.created_at,
        state: effect.outcome.status,
      });
    }
    if (reversalAttempt?.outcome) {
      items.push({
        id: reversalAttempt.outcome.id,
        label:
          reversalAttempt.outcome.status === "verified"
            ? "Reversal verified"
            : `Reversal ${reversalAttempt.outcome.status}`,
        detail: reversalAttempt.outcome.summary,
        time: reversalAttempt.outcome.created_at,
        state: `reversal-${reversalAttempt.outcome.status}`,
      });
    }
    return items.sort(
      (left, right) =>
        new Date(right.time).getTime() - new Date(left.time).getTime(),
    );
  }, [approval, effect, reversalAttempt, workspace]);

  async function refreshAgentHistory(
    personId = activeScope?.person.id,
    relationshipContextId =
      activeScope?.relationship_context.id,
  ) {
    if (!personId || !relationshipContextId) {
      return;
    }
    try {
      const response = await fetch(
        `/api/local-integration/people/${encodeURIComponent(
          personId,
        )}/contexts/${encodeURIComponent(
          relationshipContextId,
        )}/agent-history`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | RelationshipAgentHistory
        | { message?: string };
      if (response.ok && "operations" in payload) {
        setAgentHistory(payload);
      }
    } catch {
      // A refresh failure never replaces previously verified history.
    }
  }

  async function refreshWorkspaceReview(captureId: string) {
    try {
      const response = await fetch(
        `/api/local-integration/workspace?capture_id=${encodeURIComponent(
          captureId,
        )}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | WorkspaceReviewResponse
        | { message?: string };
      if (!response.ok || !("capture" in payload)) {
        return false;
      }
      setWorkspace(payload);
      return true;
    } catch {
      // Keep the last verified review visible when a background refresh fails.
      return false;
    }
  }

  async function mutate(
    path: string,
    options: RequestInit,
    label: string,
  ) {
    setBusy(label);
    setError("");
    setAnnouncement(`${label}.`);
    try {
      const response = await fetch(path, {
        cache: "no-store",
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
      });
      const payload = (await response.json()) as
        | WorkspaceReviewResponse
        | {
            workspace?: WorkspaceReviewResponse;
            code?: string;
            message?: string;
          };
      if (!response.ok) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "Canonical state could not be updated.",
        );
      }
      const next =
        "workspace" in payload && payload.workspace
          ? payload.workspace
          : (payload as WorkspaceReviewResponse);
      setWorkspace(next);
      setChatResponse(null);
      setKnowledgeSnapshot(null);
      chatRequestRef.current = null;
      setAnnouncement("Contact context updated.");
      return next;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Canonical state could not be updated.",
      );
      setAnnouncement("The update failed. Prior state remains visible.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function reviewEffectReversal() {
    if (!effect) {
      return;
    }
    setBusy("Reviewing current destination");
    setError("");
    setAnnouncement("Reading the current destination before reversal review.");
    try {
      const response = await fetch(
        `/api/local-integration/effects/${effect.attempt_id}/reversal`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | EffectReversalPreview
        | { message?: string };
      if (!response.ok || !("preview_digest" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The reversal preview could not be verified.",
        );
      }
      setReversalPreview(payload);
      setReversalReviewed(false);
      reversalApprovalRequestRef.current = null;
      setAnnouncement(
        payload.reversal_available
          ? "Exact reversal preview ready. No destination state changed."
          : "Automatic reversal is blocked by current destination state.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The reversal preview could not be verified.",
      );
      setAnnouncement("Reversal review failed. Nothing was removed.");
    } finally {
      setBusy("");
    }
  }

  async function approveCurrentEffectReversal() {
    if (!effect || !reversalPreview || !reversalReason.trim()) {
      return;
    }
    const next = await mutate(
      `/api/local-integration/effects/${effect.attempt_id}/reversal`,
      {
        method: "POST",
        body: JSON.stringify({
          capture_id: workspace?.capture.id,
          expected_destination_version:
            reversalPreview.expected_destination_version,
          expected_preview_digest: reversalPreview.preview_digest,
          reason: reversalReason.trim(),
          request_id:
            reversalApprovalRequestRef.current ??
            (reversalApprovalRequestRef.current = crypto.randomUUID()),
        }),
      },
      "Approving the exact reversal",
    );
    if (next) {
      reversalApprovalRequestRef.current = null;
      setReversalReviewed(false);
      setAnnouncement(
        "Exact reversal approved. The destination is unchanged until separate execution.",
      );
    }
  }

  async function decide(
    assertionId: string,
    version: number,
    decision: "confirm" | "dismiss" | "leave_unresolved",
    correctedValue?: string,
  ) {
    if (!workspace) {
      return;
    }
    const next = await mutate(
      `/api/local-integration/assertions/${assertionId}/decisions`,
      {
        method: "POST",
        body: JSON.stringify({
          capture_id: workspace.capture.id,
          decision,
          expected_assertion_version: version,
          ...(correctedValue?.trim()
            ? { corrected_value: correctedValue.trim() }
            : {}),
        }),
      },
      "Saving fact decision",
    );
    if (next) {
      setEditing(null);
    }
  }

  async function deleteCapture() {
    if (!workspace) {
      return;
    }
    setBusy("Deleting governed source");
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/captures/${workspace.capture.id}/deletion`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        deletion?: { derivatives_deleted: number };
        lineage?: { lineage: unknown[] };
        message?: string;
      };
      if (!response.ok || !payload.deletion || !payload.lineage) {
        throw new Error(
          payload.message ?? "The governed source could not be deleted.",
        );
      }
      setDeletionSummary({
        derivatives: payload.deletion.derivatives_deleted,
        lineage: payload.lineage.lineage.length,
      });
      setWorkspace(null);
      setChatResponse(null);
      setKnowledgeSnapshot(null);
      chatRequestRef.current = null;
      setDeleteConfirm(false);
      setAnnouncement("Source and registered derivatives deleted.");
      window.history.replaceState(null, "", "/workspace");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The governed source could not be deleted.",
      );
    } finally {
      setBusy("");
    }
  }

  function handleCommitted(next: WorkspaceReviewResponse) {
    setWorkspace(next);
    setRelationshipScope(null);
    setChatResponse(null);
    setKnowledgeSnapshot(null);
    chatRequestRef.current = null;
    setDeletionSummary(null);
    setCaptureOpen(false);
    setError("");
    setAnnouncement("New evidence is ready for fact review.");
    window.history.replaceState(
      null,
      "",
      `/workspace?capture=${encodeURIComponent(next.capture.id)}#proposed-changes`,
    );
    void refreshAgentHistory(
      next.subject.id,
      next.assignment.id,
    );
  }

  function handleRelationshipRemoved(announcement: string) {
    setWorkspace(null);
    setRelationshipScope(null);
    setIdentityResolutionCase(null);
    setAgentHistory(null);
    setChatResponse(null);
    setKnowledgeSnapshot(null);
    chatRequestRef.current = null;
    setResourceComposerOpen(false);
    setError("");
    setAnnouncement(announcement);
    window.history.replaceState(null, "", "/workspace");
  }

  function handleInitialResourcesCommitted(
    scope: RelationshipScope,
    receipts: ResourceCaptureResponse[],
    outcome:
      | "created_person"
      | "created_relationship_context"
      | "reused_relationship",
  ) {
    const identityClueSaved = receipts.some(
      (receipt) => receipt.resource.kind === "contact_record",
    );
    const identityClueDetail = identityClueSaved
      ? " One confirmed identity clue is stored as a source-linked masked handle."
      : "";
    setRelationshipScope(scope);
    setWorkspace(null);
    setAgentHistory(null);
    setAgentCreateOpen(false);
    setResourceComposerOpen(false);
    setAgentOperation({
      detail:
        outcome === "created_person"
          ? `The explicit identity, relationship context, and first governed source now share one living page.${identityClueDetail}`
          : outcome === "created_relationship_context"
            ? `The existing person was preserved and the source opened one separate relationship context.${identityClueDetail}`
            : `The source was attached to the selected existing person and relationship. No duplicate identity or context was created.${identityClueDetail}`,
      status: "completed",
      title:
        outcome === "created_person"
          ? "Living person page created"
          : outcome === "created_relationship_context"
            ? "Relationship context added"
            : "Source attached to existing relationship",
    });
    handleResourcesCommitted(receipts);
    setAnnouncement(
      outcome === "created_person"
        ? "Living person page created from the first governed source."
        : outcome === "created_relationship_context"
          ? "A new relationship context was added to the existing person."
          : "The source was attached to the existing relationship.",
    );
    window.history.replaceState(
      null,
      "",
      `/workspace?person=${encodeURIComponent(
        scope.person.id,
      )}&context=${encodeURIComponent(scope.relationship_context.id)}`,
    );
    void refreshAgentHistory(
      scope.person.id,
      scope.relationship_context.id,
    );
  }

  function replaceIdentityReviewUrl(
    caseId: string | null,
    scope: RelationshipScope | null = activeScope
      ? {
          contract_version: CONTRACT_VERSION,
          person: activeScope.person,
          relationship_context: activeScope.relationship_context,
        }
      : null,
  ) {
    const parameters = new URLSearchParams();
    if (scope) {
      parameters.set("person", scope.person.id);
      parameters.set("context", scope.relationship_context.id);
    }
    if (caseId) {
      parameters.set("identity_case", caseId);
    }
    window.history.replaceState(
      null,
      "",
      parameters.size > 0
        ? `/workspace?${parameters.toString()}`
        : "/workspace",
    );
  }

  async function handleIdentityReviewCreated(caseId: string) {
    setBusy("Opening identity review");
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/identity-resolution-cases/${caseId}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | IdentityResolutionCase
        | { message?: string };
      if (!response.ok || !("candidates" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The saved identity review could not be opened.",
        );
      }
      setIdentityResolutionCase(payload);
      setAgentCreateOpen(false);
      setAgentOperation({
        title: "Identity review saved",
        detail:
          "The governed source remains outside every person Wiki until you resolve the identity.",
        status: "staged",
      });
      setAnnouncement(
        "Identity review saved. No person or relationship was changed.",
      );
      replaceIdentityReviewUrl(caseId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The saved identity review could not be opened.",
      );
    } finally {
      setBusy("");
    }
  }

  function handleIdentityCaseUpdated(nextCase: IdentityResolutionCase) {
    setIdentityResolutionCase(nextCase);
    setAgentOperation({
      title: "Identity left unresolved",
      detail:
        "The source and your decision note are saved. Neither candidate page nor Wiki changed.",
      status: "staged",
    });
    setAnnouncement(
      "Identity remains unresolved and can be resumed later.",
    );
    replaceIdentityReviewUrl(nextCase.id);
  }

  function handleIdentityCaseResolved(
    scope: RelationshipScope,
    compilation: KnowledgeSnapshot | null,
    compilationError: string | null,
  ) {
    setIdentityResolutionCase(null);
    setRelationshipScope(scope);
    setWorkspace(null);
    setAgentHistory(null);
    setAgentCreateOpen(false);
    setChatResponse(null);
    setKnowledgeSnapshot(compilation);
    chatRequestRef.current = null;
    setAgentOperation({
      title: compilation
        ? "Identity resolved and Wiki recompiled"
        : "Identity resolved; Wiki needs retry",
      detail: compilation
        ? `The governed source is now bound to ${scope.person.display_label} inside ${scope.relationship_context.display_label}. A new source-linked Wiki snapshot was published.`
        : compilationError ??
          "The source is bound, but the derived Wiki has not been recompiled.",
      status: compilation ? "completed" : "staged",
    });
    setAnnouncement(
      compilation
        ? "Identity resolved and a new Wiki snapshot was published."
        : "Identity resolved. Wiki compilation needs retry.",
    );
    replaceIdentityReviewUrl(null, scope);
    void refreshAgentHistory(
      scope.person.id,
      scope.relationship_context.id,
    );
  }

  function cancelAgentCreate() {
    setAgentCreateOpen(false);
    setAgentOperation({
      detail: "No person, relationship context, or source was created.",
      status: "no_change",
      title: "Contact draft canceled",
    });
    setAnnouncement("Contact draft canceled. Nothing was created.");
  }

  function handleResourcesCommitted(
    receipts: ResourceCaptureResponse[],
  ) {
    setChatResponse(null);
    setKnowledgeSnapshot(null);
    chatRequestRef.current = null;
    setError("");
    setAnnouncement(
      `${receipts.length} governed ${
        receipts.length === 1 ? "resource is" : "resources are"
      } attached. Compile a new brief to include them.`,
    );
    const firstReceipt = receipts[0];
    if (
      firstReceipt?.identity.person_id &&
      firstReceipt.identity.relationship_context_id
    ) {
      void refreshAgentHistory(
        firstReceipt.identity.person_id,
        firstReceipt.identity.relationship_context_id,
      );
    }
  }

  function handlePersonMergeMutation(
    response: PersonMergeWorkflowResponse,
    sourceLabel: string,
  ) {
    const failedCompilations = response.compilations.filter(
      (compilation) => compilation.status === "failed",
    ).length;
    setChatResponse(null);
    setKnowledgeSnapshot(null);
    chatRequestRef.current = null;
    setPersonMergeReversalPreview(null);
    setError("");
    setAgentOperation({
      title:
        response.status === "applied"
          ? "Duplicate person page merged"
          : "Separate person pages restored",
      detail:
        response.status === "applied"
          ? `${sourceLabel} now resolves to this stable person page. ${response.affected_relationship_context_ids.length} relationship contexts and ${response.captures_rebound} governed sources moved with provenance intact.${
              failedCompilations > 0
                ? ` ${failedCompilations} Wiki compilations need retry.`
                : " Every affected relationship Wiki was recompiled."
            }`
          : `${sourceLabel} and its prior relationship contexts were restored as a separate person.${
              failedCompilations > 0
                ? ` ${failedCompilations} Wiki compilations need retry.`
                : " Every affected relationship Wiki was recompiled."
            }`,
      status: failedCompilations > 0 ? "staged" : "completed",
    });
    setAnnouncement(
      response.status === "applied"
        ? "Person merge applied with a reversible receipt."
        : "Person merge reversed and separate relationship memory restored.",
    );
    if (!activeScope) {
      return;
    }
    const currentContextRestoredToSource =
      response.status === "reversed" &&
      response.affected_relationship_context_ids.includes(
        activeScope.relationship_context.id,
      );
    if (currentContextRestoredToSource) {
      const restoredScope: RelationshipScope = {
        contract_version: CONTRACT_VERSION,
        person: {
          id: response.source_person_id,
          display_label: sourceLabel,
        },
        relationship_context: activeScope.relationship_context,
      };
      setRelationshipScope(restoredScope);
      setWorkspace(null);
      setAgentHistory(null);
      window.history.replaceState(
        null,
        "",
        `/workspace?person=${encodeURIComponent(
          restoredScope.person.id,
        )}&context=${encodeURIComponent(
          restoredScope.relationship_context.id,
        )}#contact-overview`,
      );
      void refreshAgentHistory(
        restoredScope.person.id,
        restoredScope.relationship_context.id,
      );
      return;
    }
    void refreshAgentHistory(
      activeScope.person.id,
      activeScope.relationship_context.id,
    );
  }

  async function handleReviewPersonMergeReversal(
    operationId: string,
  ) {
    setBusy("Reviewing merge history");
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/person-merges/${encodeURIComponent(
          operationId,
        )}/reversal`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | PersonMergeReversalPreview
        | { message?: string };
      if (!response.ok || !("operation_id" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The prior merge could not be reopened for review.",
        );
      }
      setPersonMergeReversalPreview(payload);
      setPersonMergeRequested(true);
      setAgentOperation({
        title: payload.reversal_available
          ? "Merge reversal review opened"
          : "Merge reversal needs attention",
        detail:
          payload.blockers.length > 0
            ? payload.blockers.map((blocker) => blocker.message).join(" ")
            : `The current ownership of ${payload.contexts_to_restore.length} relationship ${
                payload.contexts_to_restore.length === 1
                  ? "context"
                  : "contexts"
              } is ready for an explicit reversal decision.`,
        status: "staged",
      });
      setAnnouncement(
        payload.reversal_available
          ? "A fresh merge reversal review is ready."
          : "The prior merge is visible, but automatic reversal is paused.",
      );
      window.setTimeout(
        () => scrollWorkspaceTo("person-merge-review"),
        0,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The prior merge could not be reopened for review.",
      );
    } finally {
      setBusy("");
    }
  }

  function openResourceComposer() {
    setResourceComposerOpen(true);
    window.setTimeout(() => scrollWorkspaceTo("relationship-resources"), 0);
  }

  function runAgentUiCommand(objective: string) {
    const command = resolveAgentUiCommand(objective);
    const stageOperation = (
      title: string,
      detail: string,
      status: "completed" | "no_change" | "staged",
    ) => {
      setSubmittedChatObjective(objective.trim());
      setChatResponse(null);
      setAgentOperation({ detail, status, title });
      chatRequestRef.current = null;
    };

    if (command === "create_person") {
      setAgentCreateOpen(true);
      stageOperation(
        "Contact creation staged",
        "Complete the explicit person, relationship context, and first governed source. Nothing is created until you submit that reviewable form.",
        "staged",
      );
      setAnnouncement("Agent opened a governed contact draft.");
      return true;
    }

    if (command === "add_source") {
      openResourceComposer();
      stageOperation(
        "Source intake opened",
        "The source editor is open on this relationship. Its identity, authority, and deletion path remain explicit.",
        "completed",
      );
      setAnnouncement("Agent opened governed source intake.");
      return true;
    }

    if (command === "review_changes") {
      if (pendingCount === 0) {
        stageOperation(
          "No page changes waiting",
          "The current relationship has no staged facts that require review.",
          "no_change",
        );
        setAnnouncement("No proposed page changes are waiting.");
        return true;
      }
      scrollWorkspaceTo("proposed-changes");
      stageOperation(
        "Page review opened",
        `${pendingCount} source-linked ${
          pendingCount === 1 ? "change is" : "changes are"
        } waiting on the living page. Agent did not apply them.`,
        "completed",
      );
      setAnnouncement("Agent opened the proposed page changes.");
      return true;
    }

    if (command === "review_duplicate") {
      setPersonMergeRequested(true);
      window.setTimeout(
        () => scrollWorkspaceTo("person-merge-review"),
        0,
      );
      stageOperation(
        "Duplicate review opened",
        "Choose the other person page to compare. Agent will show relationship ownership, source counts, identity differences, and blockers before any merge is possible.",
        "staged",
      );
      setAnnouncement("Agent opened a reversible duplicate-person review.");
      return true;
    }

    if (command === "open_person") {
      scrollWorkspaceTo("contact-overview");
      stageOperation(
        "Person page opened",
        "The living page remains the structured, reviewable view of this relationship.",
        "completed",
      );
      setAnnouncement("Agent opened the living person page.");
      return true;
    }

    if (command === "open_next_move") {
      scrollWorkspaceTo("next-move");
      stageOperation(
        "Next move opened",
        "The action surface is visible. Any consequential effect still requires separate approval.",
        "completed",
      );
      setAnnouncement("Agent opened the next move.");
      return true;
    }

    return false;
  }

  async function askChat() {
    if (!activeScope || !chatObjective.trim()) {
      return;
    }
    const objective = chatObjective.trim();
    if (runAgentUiCommand(objective)) {
      return;
    }
    setAgentOperation(null);
    setBusy("Compiling a source-linked brief");
    setError("");
    if (chatRequestRef.current?.objective !== objective) {
      chatRequestRef.current = {
        objective,
        requestId: crypto.randomUUID(),
      };
    }
    try {
      const response = await fetch("/api/local-integration/chat", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: chatRequestRef.current.requestId,
          person_id: activeScope.person.id,
          relationship_context_id: activeScope.relationship_context.id,
          objective,
        }),
      });
      const payload = (await response.json()) as
        | ChatTaskResponse
        | { message?: string };
      if (!response.ok || !("blocks" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The source-linked brief could not be compiled.",
        );
      }
      setChatResponse(payload);
      setSubmittedChatObjective(objective);
      setAnnouncement(
        "Chat brief compiled from the visible person and relationship context.",
      );
      void refreshAgentHistory(
        activeScope.person.id,
        activeScope.relationship_context.id,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The source-linked brief could not be compiled.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <a className="skip-link" href="#context-main">
        Skip to contact context
      </a>
      <div
        className="context-workspace"
        data-has-scope={Boolean(activeScope)}
      >
        <p className="sr-only" aria-live="polite" role="status">
          {announcement}
        </p>
        <aside className="context-sidebar">
          <Link
            aria-label="Talent Signal home"
            className="context-brand"
            href="/"
          >
            <span aria-hidden="true">TS</span>
            <strong>Talent Signal</strong>
          </Link>

          <nav aria-label="Workspace navigation" className="context-nav">
            <a aria-label="Relationship Agent" href="#relationship-chat">
              <House aria-hidden="true" size={19} weight="duotone" />
              Agent
            </a>
            <Link aria-label="Open people directory" href="/workspace/people">
              <AddressBook aria-hidden="true" size={19} weight="duotone" />
              People
            </Link>
            <a aria-label="Open governed sources" href="#relationship-resources">
              <FileImage aria-hidden="true" size={19} weight="duotone" />
              Sources
            </a>
          </nav>

          <button
            className="context-new-capture"
            onClick={() => {
              if (activeScope) {
                openResourceComposer();
                return;
              }
              setCaptureOpen(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            {activeScope ? "Add source" : "New capture"}
          </button>

          <div className="context-sidebar__section">
            <div>
              <span>People in view</span>
            </div>
            {activeScope ? (
              <a
                className="context-person-row"
                data-active="true"
                href="#contact-overview"
              >
                <span>{initials(activeScope.person.display_label)}</span>
                <p>
                  <strong>{activeScope.person.display_label}</strong>
                  <small>
                    {activeScope.relationship_context.display_label}
                  </small>
                </p>
                {workspace && assertions.some(
                  (assertion) => assertion.review_status === "pending",
                ) ? (
                  <i aria-label="Needs review" />
                ) : null}
              </a>
            ) : (
              <p className="context-sidebar__empty">
                Add any first source to start a living contact page.
              </p>
            )}
          </div>

          <div className="context-sidebar__account">
            <span>{initials(user.name ?? user.email ?? "Recruiter")}</span>
            <p>
              <strong>{user.name ?? "Recruiter"}</strong>
              <small>{user.email ?? "Authenticated account"}</small>
            </p>
            <form action={signOutOfWorkspace}>
              <button
                aria-label="Sign out"
                className="icon-button context-account-signout"
                title="Sign out"
                type="submit"
              >
                <SignOut aria-hidden="true" size={17} />
              </button>
            </form>
            <ThemeToggle />
          </div>
        </aside>

        {!activeScope ? (
          <aside
            aria-labelledby="relationship-chat-title"
            className="context-chat context-chat--standalone"
            id="relationship-chat"
          >
            <div className="context-agent-heading">
              <span>
                <ChatCircleDots aria-hidden="true" size={18} weight="duotone" />
              </span>
              <div>
                <p>Relationship Agent</p>
                <strong id="relationship-chat-title">
                  Start from the person, not a blank prompt.
                </strong>
              </div>
            </div>
            <div className="context-agent-actions">
              <button
                data-active={agentCreateOpen}
                onClick={() => setAgentCreateOpen(true)}
                type="button"
              >
                <UserPlus aria-hidden="true" size={15} />
                Create contact
              </button>
              <button
                onClick={() => setCaptureOpen(true)}
                type="button"
              >
                <FileImage aria-hidden="true" size={15} />
                Import screenshot
              </button>
            </div>
            <div className="context-agent-thread">
              {identityResolutionCase ? (
                <AgentIdentityReviewCard
                  identityCase={identityResolutionCase}
                  onCaseUpdated={handleIdentityCaseUpdated}
                  onResolved={handleIdentityCaseResolved}
                />
              ) : agentCreateOpen ? (
                <AgentCreatePersonCard
                  onCancel={cancelAgentCreate}
                  onCommitted={handleInitialResourcesCommitted}
                  onDeferred={(caseId) =>
                    void handleIdentityReviewCreated(caseId)
                  }
                />
              ) : (
                <div className="context-agent-welcome">
                  <span>
                    <Sparkle aria-hidden="true" size={16} weight="fill" />
                  </span>
                  <div>
                    <strong>Give me the first governed source.</strong>
                    <p>
                      I can stage a new person and relationship page. You
                      decide the identity, context, and source before anything
                      is created.
                    </p>
                    <button
                      className="context-primary-button context-primary-button--compact"
                      onClick={() => setAgentCreateOpen(true)}
                      type="button"
                    >
                      Create with Agent
                      <ArrowRight aria-hidden="true" size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <footer className="context-agent-disabled-composer">
              Open or create a relationship to ask questions and operate its
              page.
            </footer>
          </aside>
        ) : null}

        <main className="context-main" id="context-main" tabIndex={-1}>
          <header className="context-topbar">
            <div>
              <span className="context-secure-state">
                <ShieldCheck aria-hidden="true" size={16} weight="duotone" />
                Private workspace
              </span>
              {activeScope ? (
                <span>
                  {workspace?.data_classification ===
                  "synthetic_fixture_only"
                    ? "Synthetic review"
                    : "Sensitive candidate evidence"}
                </span>
              ) : null}
            </div>
            <div>
              <Link href="/workspace/boundaries">Boundary cases</Link>
              <button
                className="context-primary-button context-primary-button--compact"
                onClick={() => setCaptureOpen(true)}
                type="button"
              >
                <Plus aria-hidden="true" size={17} />
                Import screenshot
              </button>
            </div>
          </header>

          {error ? (
            <div className="context-page-alert" role="alert">
              <Warning aria-hidden="true" size={21} weight="duotone" />
              <div>
                <strong>The workspace did not claim a new state.</strong>
                <p>{error}</p>
              </div>
              <button
                aria-label="Dismiss error"
                className="context-icon-button"
                onClick={() => setError("")}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
          ) : null}

          {busy ? (
            <div className="context-busy" role="status">
              <CircleNotch
                aria-hidden="true"
                className="spin"
                size={18}
              />
              {busy}. Prior readable state stays visible.
            </div>
          ) : null}

          {!workspace && !relationshipScope ? (
            <section className="context-onboarding">
              <header className="context-onboarding__header">
                <p className="eyebrow">RELATIONSHIP INTELLIGENCE</p>
                <h1>Begin with the source.</h1>
                <p>
                  Bind one person and relationship, then review what the source
                  can and cannot support.
                </p>
              </header>
              <div className="context-onboarding__workbench">
                <StartRelationshipPanel
                  onCommitted={handleInitialResourcesCommitted}
                  onScreenshot={() => setCaptureOpen(true)}
                />
                <aside
                  aria-label="From governed source to living Wiki"
                  className="context-onboarding__artifact"
                >
                  <div>
                    <span>01</span>
                    <p>
                      <strong>Bring one source</strong>
                      Note, transcript, file, link, or screenshot
                    </p>
                  </div>
                  <ArrowRight aria-hidden="true" size={19} />
                  <div>
                    <span>02</span>
                    <p>
                      <strong>Bind the context</strong>
                      Person and relationship stay explicit
                    </p>
                  </div>
                  <ArrowRight aria-hidden="true" size={19} />
                  <div>
                    <span>03</span>
                    <p>
                      <strong>Compile the Wiki</strong>
                      Evidence governs every task view
                    </p>
                  </div>
                </aside>
              </div>
              {deletionSummary ? (
                <div className="context-deletion-receipt">
                  <Prohibit aria-hidden="true" size={19} />
                  <p>
                    <strong>Previous source deleted</strong>
                    {deletionSummary.derivatives} derivatives removed ·{" "}
                    {deletionSummary.lineage} audit-safe lineage entries
                    retained.
                  </p>
                </div>
              ) : null}
            </section>
          ) : !workspace && relationshipScope ? (
            <div className="context-page context-page--resource-only">
              <section
                aria-labelledby="relationship-chat-title"
                className="context-chat"
                id="relationship-chat"
              >
                <div className="context-chat__scope">
                  <span>
                    {initials(relationshipScope.person.display_label)}
                  </span>
                  <p>
                    <strong>{relationshipScope.person.display_label}</strong>
                    <small>
                      {
                        relationshipScope.relationship_context
                          .display_label
                      }
                    </small>
                  </p>
                  <i>
                    <ShieldCheck
                      aria-hidden="true"
                      size={15}
                      weight="duotone"
                    />
                    Scoped
                  </i>
                </div>
                <div className="context-chat__intro">
                  <p className="eyebrow">RELATIONSHIP AGENT</p>
                  <h1 id="relationship-chat-title">
                    Ask, navigate, or change this page.
                  </h1>
                  <p>
                    I am scoped to this person and relationship. Page changes
                    remain staged until you review them.
                  </p>
                </div>
                <div className="context-agent-actions">
                  <button
                    onClick={() => runAgentUiCommand("Add a source")}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={15} />
                    Add source
                  </button>
                  <button
                    data-active={agentCreateOpen}
                    onClick={() => runAgentUiCommand("Create a contact")}
                    type="button"
                  >
                    <UserPlus aria-hidden="true" size={15} />
                    Create contact
                  </button>
                  <button
                    onClick={() =>
                      runAgentUiCommand("Review a possible duplicate")
                    }
                    type="button"
                  >
                    <AddressBook aria-hidden="true" size={15} />
                    Review duplicate
                  </button>
                </div>
                {identityResolutionCase ? (
                  <AgentIdentityReviewCard
                    identityCase={identityResolutionCase}
                    onCaseUpdated={handleIdentityCaseUpdated}
                    onResolved={handleIdentityCaseResolved}
                  />
                ) : agentCreateOpen ? (
                  <AgentCreatePersonCard
                    onCancel={cancelAgentCreate}
                    onCommitted={handleInitialResourcesCommitted}
                    onDeferred={(caseId) =>
                      void handleIdentityReviewCreated(caseId)
                    }
                  />
                ) : agentOperation ? (
                  <div
                    className="context-agent-operation"
                    data-status={agentOperation.status}
                  >
                    <p className="context-agent-user-message">
                      {submittedChatObjective}
                    </p>
                    <article>
                      <header>
                        <span>
                          {agentOperation.status === "staged"
                            ? "Staged"
                            : agentOperation.status === "no_change"
                              ? "No change"
                              : "Completed"}
                        </span>
                        <i>Page operation</i>
                      </header>
                      <strong>{agentOperation.title}</strong>
                      <p>{agentOperation.detail}</p>
                    </article>
                  </div>
                ) : null}
                <AgentHistory
                  history={agentHistory}
                  onReviewMerge={(operationId) =>
                    void handleReviewPersonMergeReversal(operationId)
                  }
                />
                <form
                  className="context-chat__composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void askChat();
                  }}
                >
                  <label>
                    <span className="sr-only">
                      Ask about this relationship
                    </span>
                    <textarea
                      maxLength={1_000}
                      onChange={(event) => {
                        setChatObjective(event.target.value);
                        chatRequestRef.current = null;
                      }}
                      rows={2}
                      value={chatObjective}
                    />
                  </label>
                  <button
                    className="context-primary-button"
                    disabled={!chatObjective.trim() || Boolean(busy)}
                    type="submit"
                  >
                    {busy === "Compiling a source-linked brief" ? (
                      <CircleNotch
                        aria-hidden="true"
                        className="spin"
                        size={18}
                      />
                    ) : (
                      <Sparkle
                        aria-hidden="true"
                        size={18}
                        weight="fill"
                      />
                    )}
                    Ask Agent
                  </button>
                </form>
                {chatResponse ? (
                  <div className="context-chat__response">
                    <p className="context-agent-user-message">
                      {submittedChatObjective}
                    </p>
                    <div className="context-chat__response-meta">
                      <span>
                        Snapshot{" "}
                        {chatResponse.knowledge_snapshot_id.slice(0, 8)}
                      </span>
                      <span>
                        Manifest{" "}
                        {chatResponse.context_manifest_id.slice(0, 8)}
                      </span>
                      <span>
                        {chatResponse.disposition.replaceAll("_", " ")}
                      </span>
                    </div>
                    {chatResponse.blocks.map((block) => (
                      <article data-kind={block.kind} key={block.id}>
                        <header>
                          <span>{block.kind.replaceAll("_", " ")}</span>
                          <i>{block.status.replaceAll("_", " ")}</i>
                        </header>
                        <h2>{block.title}</h2>
                        <p>{block.body}</p>
                        <footer>
                          <span>
                            <LinkSimple aria-hidden="true" size={14} />
                            {block.citation_dependency_ids.length} governed{" "}
                            references
                          </span>
                          {block.requires_user_decision ? (
                            <a
                              href="#source-evidence"
                              onClick={(event) => {
                                event.preventDefault();
                                openResourceComposer();
                              }}
                            >
                              Review source
                              <ArrowRight aria-hidden="true" size={14} />
                            </a>
                          ) : null}
                        </footer>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="context-chat__empty">
                    Ask when you need a brief. The source ledger remains the
                    stable object; Chat is a task-specific view over it.
                  </p>
                )}
              </section>

              <section
                className="context-contact-header"
                id="contact-overview"
              >
                <div className="context-contact-header__portrait">
                  <div
                    aria-label={`${relationshipScope.person.display_label} initials; no verified contact photo`}
                    className="context-contact-header__avatar"
                    role="img"
                  >
                    {relationshipScope.person.display_label
                      .trim()
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <span>No verified photo</span>
                </div>
                <div className="context-contact-header__identity">
                  <p className="eyebrow">LIVING PERSON PAGE</p>
                  <h1
                    data-long={
                      relationshipScope.person.display_label.length > 22
                    }
                  >
                    {relationshipScope.person.display_label}
                  </h1>
                  <p>
                    {
                      relationshipScope.relationship_context
                        .display_label
                    }
                  </p>
                  <div>
                    <span>
                      <AddressBook aria-hidden="true" size={14} />
                      Identity bound by recruiter
                    </span>
                    <span>
                      <ShieldCheck aria-hidden="true" size={14} />
                      Source claims stay reviewable
                    </span>
                  </div>
                </div>
              </section>

              <RelationshipWikiPanel
                busy={busy === "Compiling a source-linked brief"}
                onCompile={() => void askChat()}
                onReviewSources={openResourceComposer}
                response={chatResponse}
                snapshot={knowledgeSnapshot}
              />

              <PersonMergeReview
                currentPerson={relationshipScope.person}
                forceOpen={personMergeRequested}
                onCloseRequest={() => {
                  setPersonMergeRequested(false);
                  setPersonMergeReversalPreview(null);
                }}
                onMutation={handlePersonMergeMutation}
                reversalPreview={personMergeReversalPreview}
              />

              <ExternalEffectReview history={agentHistory} />

              {resourceComposerOpen ? (
                <RelationshipResourceComposer
                  onCommitted={handleResourcesCommitted}
                  onEvidenceChanged={(announcement, relationshipRemoved) => {
                    if (relationshipRemoved) {
                      handleRelationshipRemoved(
                        announcement ??
                          "Source lineage deleted. No active relationship remains.",
                      );
                      return;
                    }
                    setChatResponse(null);
                    setKnowledgeSnapshot(null);
                    chatRequestRef.current = null;
                    setAnnouncement(
                      announcement ??
                        "Evidence review saved. Compile a new brief to use the updated source state.",
                    );
                    void refreshAgentHistory(
                      relationshipScope.person.id,
                      relationshipScope.relationship_context.id,
                    );
                  }}
                  onScreenshot={() => setCaptureOpen(true)}
                  personId={relationshipScope.person.id}
                  relationshipContextId={
                    relationshipScope.relationship_context.id
                  }
                  scopeLabel={`${relationshipScope.person.display_label} · ${relationshipScope.relationship_context.display_label}`}
                />
              ) : (
                <section
                  className="context-resource-launcher"
                  id="relationship-resources"
                >
                  <div>
                    <span>
                      <Plus aria-hidden="true" size={16} />
                    </span>
                    <p>
                      <strong>Add another governed source</strong>
                      <small>
                        Note, transcript, file, link, resume, or screenshot
                      </small>
                    </p>
                  </div>
                  <button
                    className="context-secondary-button"
                    onClick={() => setResourceComposerOpen(true)}
                    type="button"
                  >
                    Choose source
                  </button>
                </section>
              )}
            </div>
          ) : workspace ? (
            <div className="context-page">
              <section
                aria-labelledby="relationship-chat-title"
                className="context-chat"
                id="relationship-chat"
              >
                <div className="context-chat__scope">
                  <span>{initials(workspace.subject.display_label)}</span>
                  <p>
                    <strong>{workspace.subject.display_label}</strong>
                    <small>{workspace.assignment.display_label}</small>
                  </p>
                  <i>
                    <ShieldCheck
                      aria-hidden="true"
                      size={15}
                      weight="duotone"
                    />
                    Scoped
                  </i>
                </div>
                <div className="context-chat__intro">
                  <p className="eyebrow">RELATIONSHIP AGENT</p>
                  <h1 id="relationship-chat-title">
                    Ask, navigate, or change this page.
                  </h1>
                  <p>
                    I am scoped to this person and relationship. Every answer
                    and proposed change keeps its source boundary.
                  </p>
                </div>
                <div className="context-agent-actions">
                  <button
                    disabled={pendingCount === 0}
                    onClick={() =>
                      runAgentUiCommand("Review pending changes")
                    }
                    type="button"
                  >
                    <CheckCircle aria-hidden="true" size={15} />
                    {pendingCount > 0
                      ? `Review ${pendingCount} ${
                          pendingCount === 1 ? "change" : "changes"
                        }`
                      : "No changes waiting"}
                  </button>
                  <button
                    onClick={() => runAgentUiCommand("Add a source")}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={15} />
                    Add source
                  </button>
                  <button
                    onClick={() => runAgentUiCommand("Show the next move")}
                    type="button"
                  >
                    <ArrowRight aria-hidden="true" size={15} />
                    Next move
                  </button>
                  <button
                    data-active={agentCreateOpen}
                    onClick={() => runAgentUiCommand("Create a contact")}
                    type="button"
                  >
                    <UserPlus aria-hidden="true" size={15} />
                    Create contact
                  </button>
                  <button
                    onClick={() =>
                      runAgentUiCommand("Review a possible duplicate")
                    }
                    type="button"
                  >
                    <AddressBook aria-hidden="true" size={15} />
                    Review duplicate
                  </button>
                </div>
                {identityResolutionCase ? (
                  <AgentIdentityReviewCard
                    identityCase={identityResolutionCase}
                    onCaseUpdated={handleIdentityCaseUpdated}
                    onResolved={handleIdentityCaseResolved}
                  />
                ) : agentCreateOpen ? (
                  <AgentCreatePersonCard
                    onCancel={cancelAgentCreate}
                    onCommitted={handleInitialResourcesCommitted}
                    onDeferred={(caseId) =>
                      void handleIdentityReviewCreated(caseId)
                    }
                  />
                ) : agentOperation ? (
                  <div
                    className="context-agent-operation"
                    data-status={agentOperation.status}
                  >
                    <p className="context-agent-user-message">
                      {submittedChatObjective}
                    </p>
                    <article>
                      <header>
                        <span>
                          {agentOperation.status === "staged"
                            ? "Staged"
                            : agentOperation.status === "no_change"
                              ? "No change"
                              : "Completed"}
                        </span>
                        <i>Page operation</i>
                      </header>
                      <strong>{agentOperation.title}</strong>
                      <p>{agentOperation.detail}</p>
                    </article>
                  </div>
                ) : pendingCount > 0 ? (
                  <div className="context-agent-page-update">
                    <header>
                      <span>
                        <Sparkle aria-hidden="true" size={15} weight="fill" />
                      </span>
                      <div>
                        <strong>Page changes are waiting</strong>
                        <p>
                          {pendingCount}{" "}
                          source-linked facts are staged on the living page.
                        </p>
                      </div>
                      <i>Not applied</i>
                    </header>
                    <button
                      className="context-primary-button context-primary-button--compact"
                      onClick={() => scrollWorkspaceTo("proposed-changes")}
                      type="button"
                    >
                      Review on page
                      <ArrowRight aria-hidden="true" size={15} />
                    </button>
                  </div>
                ) : null}
                <AgentHistory
                  history={agentHistory}
                  onReviewMerge={(operationId) =>
                    void handleReviewPersonMergeReversal(operationId)
                  }
                />
                <form
                  className="context-chat__composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void askChat();
                  }}
                >
                  <label>
                    <span className="sr-only">Ask about this relationship</span>
                    <textarea
                      maxLength={1_000}
                      onChange={(event) => {
                        setChatObjective(event.target.value);
                        chatRequestRef.current = null;
                      }}
                      rows={2}
                      value={chatObjective}
                    />
                  </label>
                  <button
                    className="context-primary-button"
                    disabled={!chatObjective.trim() || Boolean(busy)}
                    type="submit"
                  >
                    {busy === "Compiling a source-linked brief" ? (
                      <CircleNotch
                        aria-hidden="true"
                        className="spin"
                        size={18}
                      />
                    ) : (
                      <Sparkle aria-hidden="true" size={18} weight="fill" />
                    )}
                    Ask Agent
                  </button>
                </form>
                {chatResponse ? (
                  <div className="context-chat__response">
                    <p className="context-agent-user-message">
                      {submittedChatObjective}
                    </p>
                    <div className="context-chat__response-meta">
                      <span>
                        Snapshot {chatResponse.knowledge_snapshot_id.slice(0, 8)}
                      </span>
                      <span>
                        Manifest {chatResponse.context_manifest_id.slice(0, 8)}
                      </span>
                      <span>{chatResponse.disposition.replaceAll("_", " ")}</span>
                    </div>
                    {chatResponse.blocks.map((block) => (
                      <article data-kind={block.kind} key={block.id}>
                        <header>
                          <span>
                            {block.kind.replaceAll("_", " ")}
                          </span>
                          <i>{block.status.replaceAll("_", " ")}</i>
                        </header>
                        <h2>{block.title}</h2>
                        <p>{block.body}</p>
                        <footer>
                          <span>
                            <LinkSimple aria-hidden="true" size={14} />
                            {block.citation_dependency_ids.length} governed{" "}
                            {block.citation_dependency_ids.length === 1
                              ? "reference"
                              : "references"}
                          </span>
                          {block.requires_user_decision ? (
                            <a href="#next-move">
                              Review before acting
                              <ArrowRight aria-hidden="true" size={14} />
                            </a>
                          ) : null}
                        </footer>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="context-chat__empty">
                    Nothing is synthesized until you ask. Proposed facts stay
                    visible as review items; generated actions never execute
                    from Chat.
                  </p>
                )}
              </section>

              <section className="context-contact-header" id="contact-overview">
                <div className="context-contact-header__portrait">
                  <div
                    aria-label={`${workspace.subject.display_label} initials; no verified contact photo`}
                    className="context-contact-header__avatar"
                    role="img"
                  >
                    {workspace.subject.display_label
                      .trim()
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <span>No verified photo</span>
                </div>
                <div className="context-contact-header__identity">
                  <p className="eyebrow">LIVING CONTACT PAGE</p>
                  <h1
                    data-long={workspace.subject.display_label.length > 22}
                  >
                    {workspace.subject.display_label}
                  </h1>
                  <p>{workspace.assignment.display_label}</p>
                  <div>
                    <span>
                      <AddressBook aria-hidden="true" size={14} />
                      Identity bound by recruiter
                    </span>
                    <span>
                      <FileImage aria-hidden="true" size={14} />
                      {sourceKindLabel(workspace.capture.source.kind)}
                    </span>
                    <span>
                      <Clock aria-hidden="true" size={14} />
                      Updated {formatDate(workspace.analysis.created_at)}
                    </span>
                  </div>
                </div>
                <div className="context-contact-header__signal">
                  <span>Current dependency</span>
                  <strong>
                    {!sourceAuthorizationAvailable
                      ? `Source access ${workspace.source_authorization.state}`
                      : effect?.outcome?.status === "verified"
                      ? "Next move recorded"
                      : assertions.some(
                            (assertion) =>
                              assertion.review_status === "pending",
                          )
                        ? "Evidence needs review"
                        : confirmedCount > 0
                          ? "Context is current"
                          : "No confirmed change"}
                  </strong>
                  <small>
                    Derived from review state. It never rates the person.
                  </small>
                </div>
              </section>

              <RelationshipWikiPanel
                busy={busy === "Compiling a source-linked brief"}
                onCompile={() => void askChat()}
                onReviewSources={openResourceComposer}
                response={chatResponse}
                snapshot={knowledgeSnapshot}
              />

              <PersonMergeReview
                currentPerson={{
                  id: workspace.subject.id,
                  display_label: workspace.subject.display_label,
                }}
                forceOpen={personMergeRequested}
                onCloseRequest={() => {
                  setPersonMergeRequested(false);
                  setPersonMergeReversalPreview(null);
                }}
                onMutation={handlePersonMergeMutation}
                reversalPreview={personMergeReversalPreview}
              />

              <ExternalEffectReview history={agentHistory} />

              {resourceComposerOpen ? (
                <RelationshipResourceComposer
                  onCommitted={handleResourcesCommitted}
                  onEvidenceChanged={async (
                    announcement,
                    relationshipRemoved,
                  ) => {
                    if (relationshipRemoved) {
                      handleRelationshipRemoved(
                        announcement ??
                          "Source lineage deleted. No active relationship remains.",
                      );
                      return;
                    }
                    setChatResponse(null);
                    setKnowledgeSnapshot(null);
                    chatRequestRef.current = null;
                    const refreshed = await refreshWorkspaceReview(
                      workspace.capture.id,
                    );
                    setAnnouncement(
                      refreshed
                        ? announcement ??
                            "Evidence review saved. Compile a new brief to use the updated source state."
                        : `${
                            announcement ?? "Evidence review saved."
                          } The current review could not refresh; reload before making another decision.`,
                    );
                    void refreshAgentHistory(
                      workspace.subject.id,
                      workspace.assignment.id,
                    );
                  }}
                  onScreenshot={() => setCaptureOpen(true)}
                  personId={workspace.subject.id}
                  relationshipContextId={workspace.assignment.id}
                  scopeLabel={`${workspace.subject.display_label} · ${workspace.assignment.display_label}`}
                />
              ) : (
                <section
                  className="context-resource-launcher"
                  id="relationship-resources"
                >
                  <div>
                    <span>
                      <Plus aria-hidden="true" size={16} />
                    </span>
                    <p>
                      <strong>Add another governed source</strong>
                      <small>
                        Note, transcript, file, link, resume, or screenshot
                      </small>
                    </p>
                  </div>
                  <button
                    className="context-secondary-button"
                    onClick={() => setResourceComposerOpen(true)}
                    type="button"
                  >
                    Choose source
                  </button>
                </section>
              )}

              <section
                aria-labelledby="lineage-title"
                className="context-lineage"
              >
                <div className="context-lineage__heading">
                  <div>
                    <p className="eyebrow">SOURCE LINEAGE</p>
                    <h2 id="lineage-title">How this contact came into view</h2>
                  </div>
                  <span>
                    <ShieldCheck aria-hidden="true" size={15} weight="duotone" />
                    Traceable
                  </span>
                </div>
                <ol>
                  <li>
                    <i aria-hidden="true">01</i>
                    <span>Source</span>
                    <strong>
                      {sourceKindLabel(workspace.capture.source.kind)}
                    </strong>
                    <small>
                      {workspace.capture.source.source_timezone
                        ? `Time zone ${workspace.capture.source.source_timezone}`
                        : "Conversation date not confirmed"}
                    </small>
                  </li>
                  <li>
                    <i aria-hidden="true">02</i>
                    <span>Identity anchor</span>
                    <strong>{workspace.subject.display_label}</strong>
                    <small>Bound by the recruiter, not guessed from a face</small>
                  </li>
                  <li>
                    <i aria-hidden="true">03</i>
                    <span>Relationship scope</span>
                    <strong>{workspace.assignment.display_label}</strong>
                    <small>Context stays inside this relationship</small>
                  </li>
                  <li>
                    <i aria-hidden="true">04</i>
                    <span>Current projection</span>
                    <strong>Living contact</strong>
                    <small>
                      {sourceScopeLabel(
                        workspace.capture.source.retention.source_scope,
                      )}
                    </small>
                  </li>
                </ol>
                <p className="context-lineage__note">
                  The small chat avatar is source context, not a verified
                  portrait. Until the recruiter adds a confirmed photo, this
                  page uses a neutral monogram.
                </p>
              </section>

              <div className="context-page-grid">
                <div className="context-page-primary">
                  <section
                    aria-labelledby="changed-title"
                    className="context-section context-changed"
                    id="proposed-changes"
                    tabIndex={-1}
                  >
                    <div className="context-section__heading">
                      <div>
                        <p className="eyebrow">WHAT CHANGED</p>
                        <h2 id="changed-title">
                          Evidence waiting for your judgment
                        </h2>
                      </div>
                      <span>
                        {reviewedCount}/{assertions.length} reviewed
                      </span>
                    </div>

                    {assertions.length > 0 ? (
                      <div className="context-facts">
                        {assertions.map((assertion) => {
                          const evidence = evidenceById.get(
                            assertion.evidence_id,
                          );
                          const isEditing = editing === assertion.id;
                          const edited =
                            edits[assertion.id] ??
                            assertion.value ??
                            "";
                          const pending =
                            assertion.review_status === "pending";
                          const ambiguous =
                            pending && assertion.status === "ambiguous";
                          const needsCalendarDate =
                            ambiguous &&
                            assertion.field === "decision_deadline";
                          const currentFieldState =
                            activeConfirmedStates.find(
                              (state) => state.field === assertion.field,
                            );
                          const valueUnderReview = isEditing
                            ? edited.trim()
                            : assertion.value?.trim() ?? "";
                          const requiresSupersession = Boolean(
                            pending &&
                              currentFieldState &&
                              currentFieldState.value !== valueUnderReview &&
                              assertion.temporal_relation !== "supersedes",
                          );
                          const editedValueIsValid =
                            edited.trim().length > 0 &&
                            (!needsCalendarDate ||
                              isCompleteCalendarDate(edited));
                          return (
                            <article
                              data-state={assertion.review_status}
                              key={assertion.id}
                            >
                              <div className="context-fact__main">
                                <div className="context-fact__label">
                                  <span>{fieldLabel(assertion.field)}</span>
                                  <i>
                                    {ambiguous
                                      ? "Needs clarification"
                                      : reviewLabel(assertion.review_status)}
                                  </i>
                                </div>
                                {isEditing ? (
                                  <label className="context-fact__edit">
                                    <span className="sr-only">
                                      Corrected value
                                    </span>
                                    <input
                                      autoFocus
                                      maxLength={2_000}
                                      onChange={(event) =>
                                        setEdits((current) => ({
                                          ...current,
                                          [assertion.id]:
                                            event.target.value,
                                        }))
                                      }
                                      placeholder={
                                        needsCalendarDate
                                          ? "YYYY-MM-DD"
                                          : undefined
                                      }
                                      value={edited}
                                    />
                                    {needsCalendarDate ? (
                                      <small>
                                        Add a complete calendar date. The
                                        screenshot did not provide a verified
                                        timestamp for “{assertion.value}”.
                                      </small>
                                    ) : null}
                                  </label>
                                ) : (
                                  <p className="context-fact__value">
                                    {assertion.value}
                                  </p>
                                )}
                                <a
                                  className="context-fact__evidence"
                                  href={`#source-${assertion.evidence_id}`}
                                >
                                  <Quotes
                                    aria-hidden="true"
                                    size={16}
                                    weight="fill"
                                  />
                                  <span>
                                    “{assertion.evidence_quote}”
                                    {evidence
                                      ? ` · ${evidence.source_message_id}`
                                      : ""}
                                  </span>
                                </a>
                                {ambiguous && !isEditing ? (
                                  <p className="context-fact__ambiguity">
                                    This extracted value is not anchored well
                                    enough to remember as-is. Correct it, keep
                                    it unresolved, or dismiss it.
                                  </p>
                                ) : null}
                                {requiresSupersession ? (
                                  <div className="context-fact__ambiguity" role="status">
                                    <strong>Current value stays in place</strong>
                                    <span>
                                      {currentFieldState?.value} → {valueUnderReview}
                                    </span>
                                    <small>
                                      Replacing it requires a separate source-linked
                                      supersession proposal. Keep this unresolved or
                                      dismiss it if that proposal is not available.
                                    </small>
                                  </div>
                                ) : null}
                              </div>

                              {pending ? (
                                <div className="context-fact__actions">
                                  {isEditing ? (
                                    <>
                                      <button
                                        className="context-primary-button context-primary-button--compact"
                                        disabled={
                                          Boolean(busy) ||
                                          !editedValueIsValid ||
                                          requiresSupersession
                                        }
                                        onClick={() =>
                                          decide(
                                            assertion.id,
                                            assertion.version,
                                            "confirm",
                                            edited,
                                          )
                                        }
                                        type="button"
                                      >
                                        <Check
                                          aria-hidden="true"
                                          size={16}
                                        />
                                        Save and confirm
                                      </button>
                                      <button
                                        className="context-text-button"
                                        onClick={() => setEditing(null)}
                                        type="button"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {ambiguous ? (
                                        <button
                                          className="context-primary-button context-primary-button--compact"
                                          disabled={Boolean(busy)}
                                          onClick={() => {
                                            setEditing(assertion.id);
                                            setEdits((current) => ({
                                              ...current,
                                              [assertion.id]: "",
                                            }));
                                          }}
                                          type="button"
                                        >
                                          <PencilSimple
                                            aria-hidden="true"
                                            size={16}
                                          />
                                          {needsCalendarDate
                                            ? "Add full date"
                                            : "Resolve"}
                                        </button>
                                      ) : (
                                        <>
                                          {requiresSupersession ? (
                                            <button
                                              className="context-primary-button context-primary-button--compact"
                                              disabled
                                              type="button"
                                            >
                                              <Warning aria-hidden="true" size={16} />
                                              Supersession required
                                            </button>
                                          ) : (
                                            <button
                                              className="context-primary-button context-primary-button--compact"
                                              disabled={Boolean(busy)}
                                              onClick={() =>
                                                decide(
                                                  assertion.id,
                                                  assertion.version,
                                                  "confirm",
                                                )
                                              }
                                              type="button"
                                            >
                                              <Check
                                                aria-hidden="true"
                                                size={16}
                                              />
                                              Confirm
                                            </button>
                                          )}
                                          <button
                                            aria-label={`Edit ${fieldLabel(assertion.field)}`}
                                            className="context-icon-button"
                                            onClick={() => {
                                              setEditing(assertion.id);
                                              setEdits((current) => ({
                                                ...current,
                                                [assertion.id]:
                                                  assertion.value ?? "",
                                              }));
                                            }}
                                            type="button"
                                          >
                                            <PencilSimple
                                              aria-hidden="true"
                                              size={17}
                                            />
                                          </button>
                                        </>
                                      )}
                                      <button
                                        className="context-text-button"
                                        disabled={Boolean(busy)}
                                        onClick={() =>
                                          decide(
                                            assertion.id,
                                            assertion.version,
                                            "leave_unresolved",
                                          )
                                        }
                                        type="button"
                                      >
                                        Unsure
                                      </button>
                                      <button
                                        className="context-text-button"
                                        disabled={Boolean(busy)}
                                        onClick={() =>
                                          decide(
                                            assertion.id,
                                            assertion.version,
                                            "dismiss",
                                          )
                                        }
                                        type="button"
                                      >
                                        Dismiss
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    ) : !sourceAuthorizationAvailable ? (
                      <div className="context-no-signal context-no-signal--page">
                        <Warning aria-hidden="true" size={25} />
                        <p>
                          <strong>Source access is unavailable.</strong>
                          Restore or renew this governed source from Sources.
                          Its prior conclusions and actions will not return
                          automatically; the evidence comes back for review.
                        </p>
                      </div>
                    ) : (
                      <div className="context-no-signal context-no-signal--page">
                        <CheckCircle aria-hidden="true" size={25} />
                        <p>
                          <strong>No operational change was proposed.</strong>
                          The source remains available as context, but it does
                          not justify a fact or next move.
                        </p>
                      </div>
                    )}
                  </section>

                  <section
                    aria-labelledby="confirmed-title"
                    className="context-section"
                  >
                    <div className="context-section__heading">
                      <div>
                        <p className="eyebrow">KNOWN CONTEXT</p>
                        <h2 id="confirmed-title">Confirmed in this relationship</h2>
                      </div>
                      <span>
                        {activeConfirmedStates.length} active
                      </span>
                    </div>
                    {activeConfirmedStates.length > 0 ? (
                      <dl className="context-known">
                        {activeConfirmedStates.map((state) => (
                          <div key={state.id}>
                            <dt>{fieldLabel(state.field)}</dt>
                            <dd>{state.value}</dd>
                            <a href={`#source-${state.evidence_id}`}>
                              <LinkSimple aria-hidden="true" size={15} />
                              Source
                            </a>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="context-section__empty">
                        Confirm a proposed fact to add it here. Model output
                        alone never becomes remembered context.
                      </p>
                    )}
                    {historicalConfirmedStates.length > 0 ? (
                      <details className="context-retention context-known-history">
                        <summary>
                          Previous fact versions ({historicalConfirmedStates.length})
                        </summary>
                        <dl>
                          {historicalConfirmedStates.map((state) => (
                            <div key={state.id}>
                              <dt>{fieldLabel(state.field)}</dt>
                              <dd>
                                {state.value} · {state.state_status}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    ) : null}
                  </section>

                  <section
                    aria-labelledby="source-title"
                    className="context-section"
                    id="source-evidence"
                  >
                    <div className="context-section__heading">
                      <div>
                        <p className="eyebrow">SOURCE</p>
                        <h2 id="source-title">Reviewed extracted text</h2>
                      </div>
                      <span>{workspace.source_authorization.state}</span>
                    </div>
                    <div className="context-source-list">
                      {workspace.capture.messages.map((message) => (
                        <figure
                          id={`source-${message.id}`}
                          key={message.id}
                          tabIndex={-1}
                        >
                          <figcaption>
                            <span>{message.speaker}</span>
                            <small>{message.source_message_id}</small>
                          </figcaption>
                          <blockquote>
                            {message.text ??
                              (sourceAuthorizationAvailable
                                ? "Source text is no longer retained."
                                : `Source authorization is ${workspace.source_authorization.state}. Restore or renew it from Sources before reviewing the evidence.`)}
                          </blockquote>
                        </figure>
                      ))}
                    </div>
                    <details className="context-retention">
                      <summary>Retention and provenance</summary>
                      <dl>
                        <div>
                          <dt>Stored source</dt>
                          <dd>
                            {
                              workspace.capture.source.retention
                                .source_scope
                            }
                          </dd>
                        </div>
                        <div>
                          <dt>Raw screenshot</dt>
                          <dd>Not stored by Talent Signal</dd>
                        </div>
                        <div>
                          <dt>Retention until</dt>
                          <dd>
                            {workspace.capture.source.retention
                              .retention_until
                              ? formatDate(
                                  workspace.capture.source.retention
                                    .retention_until,
                                )
                              : "Review completion"}
                          </dd>
                        </div>
                        <div>
                          <dt>Producer</dt>
                          <dd>{workspace.analysis.producer.name}</dd>
                        </div>
                      </dl>
                    </details>
                  </section>
                </div>

                <aside
                  aria-label="Next move and relationship history"
                  className="context-page-aside"
                >
                  <section className="context-next-move" id="next-move">
                    <div className="context-next-move__heading">
                      <span>
                        <Sparkle aria-hidden="true" size={17} weight="fill" />
                      </span>
                      <div>
                        <p className="eyebrow">NEXT MOVE</p>
                        <h2>Smallest supported step</h2>
                      </div>
                    </div>

                    {action ? (
                      <>
                        <div className="context-next-move__body">
                          <strong>{action.target}</strong>
                          <p>{action.reason}</p>
                          <dl>
                            <div>
                              <dt>Owner</dt>
                              <dd>You</dd>
                            </div>
                            <div>
                              <dt>Due</dt>
                              <dd>{action.due}</dd>
                            </div>
                            <div>
                              <dt>Destination</dt>
                              <dd>Internal attention queue</dd>
                            </div>
                          </dl>
                        </div>

                        {!requiredFactsConfirmed ? (
                          <div className="context-next-move__gate">
                            <ShieldCheck aria-hidden="true" size={18} />
                            <p>
                              Confirm every required fact before this internal
                              action can be approved.
                            </p>
                          </div>
                        ) : null}

                        {staleApprovalNeedsReview ? (
                          <div className="context-next-move__gate">
                            <Warning aria-hidden="true" size={18} />
                            <p>
                              <strong>Prior approval is stale.</strong> The
                              exact action changed after approval. Review the
                              current target and change before approving this
                              version.
                            </p>
                          </div>
                        ) : null}

                        {canApproveCurrentAction ? (
                          <button
                            className="context-primary-button"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              mutate(
                                `/api/local-integration/actions/${action.id}/approval`,
                                {
                                  method: "POST",
                                  body: JSON.stringify({
                                    capture_id: workspace.capture.id,
                                  }),
                                },
                                "Approving exact internal action",
                              )
                            }
                            type="button"
                          >
                            <ShieldCheck aria-hidden="true" size={18} />
                            {staleApprovalNeedsReview
                              ? "Approve revised internal action"
                              : "Approve exact internal action"}
                          </button>
                        ) : null}

                        {approval?.status === "active" && !effect ? (
                          <div className="context-approved-action">
                            <p>
                              <CheckCircle
                                aria-hidden="true"
                                size={18}
                                weight="fill"
                              />
                              Exact action approved
                            </p>
                            <button
                              className="context-primary-button"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                mutate(
                                  `/api/local-integration/actions/${action.id}/execution`,
                                  {
                                    method: "POST",
                                    body: JSON.stringify({
                                      capture_id: workspace.capture.id,
                                    }),
                                  },
                                  "Writing and verifying internal attention",
                                )
                              }
                              type="button"
                            >
                              <ArrowRight aria-hidden="true" size={18} />
                              Add to Today and verify
                            </button>
                          </div>
                        ) : null}

                        {effect?.outcome ? (
                          <div
                            className="context-outcome"
                            data-state={effect.outcome.status}
                          >
                            {effect.outcome.status === "verified" ? (
                              <CheckCircle
                                aria-hidden="true"
                                size={25}
                                weight="fill"
                              />
                            ) : (
                              <Warning
                                aria-hidden="true"
                                size={25}
                                weight="fill"
                              />
                            )}
                            <p>
                              <strong>
                                {effect.outcome.status === "verified"
                                  ? "Recorded in Today"
                                  : `Result ${effect.outcome.status}`}
                              </strong>
                              {effect.outcome.summary}
                            </p>
                            {effect.outcome.status === "unknown" ? (
                              <button
                                className="context-secondary-button"
                                disabled={Boolean(busy)}
                                onClick={() =>
                                  mutate(
                                    `/api/local-integration/effects/${effect.attempt_id}/reconciliation`,
                                    {
                                      method: "POST",
                                      body: JSON.stringify({
                                        capture_id: workspace.capture.id,
                                      }),
                                    },
                                    "Reconciling destination before retry",
                                  )
                                }
                                type="button"
                              >
                                <ArrowRight aria-hidden="true" size={17} />
                                Reconcile before retry
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        {effect?.outcome?.status === "verified" ? (
                          <section
                            aria-labelledby="effect-reversal-title"
                            className="context-effect-reversal"
                          >
                            <header>
                              <div>
                                <p className="eyebrow">REVERSAL</p>
                                <h3 id="effect-reversal-title">
                                  Remove the local effect safely
                                </h3>
                              </div>
                              <span>Separate approval</span>
                            </header>
                            <p>
                              Reversal removes only the labeled simulated
                              Today item. The original approval, execution,
                              readback, and reversal decision stay in history.
                            </p>

                            {reversalAttempt?.outcome?.status ===
                            "verified" ? (
                              <div
                                className="context-effect-reversal__receipt"
                                role="status"
                              >
                                <CheckCircle
                                  aria-hidden="true"
                                  size={23}
                                  weight="fill"
                                />
                                <div>
                                  <strong>Removed and verified absent</strong>
                                  <p>{reversalAttempt.outcome.summary}</p>
                                  <small>
                                    Original effect {effect.attempt_id.slice(0, 8)} ·
                                    reversal {reversalAttempt.reversal_attempt_id.slice(0, 8)}
                                  </small>
                                </div>
                              </div>
                            ) : reversal?.status === "approved" &&
                              reversalApproval?.status === "active" ? (
                              <div className="context-effect-reversal__approved">
                                <dl>
                                  <div>
                                    <dt>Exact item</dt>
                                    <dd>
                                      {
                                        reversalApproval.exact_preview
                                          .current_effect.title
                                      }
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Destination</dt>
                                    <dd>
                                      {
                                        reversalApproval.exact_preview.target
                                          .label
                                      }
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Bound version</dt>
                                    <dd>
                                      {
                                        reversalApproval.exact_preview
                                          .expected_destination_version
                                      }
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Reason</dt>
                                    <dd>{reversalApproval.reason}</dd>
                                  </div>
                                </dl>
                                <div className="context-effect-reversal__actions">
                                  <button
                                    className="context-primary-button"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                      mutate(
                                        `/api/local-integration/effects/${effect.attempt_id}/reversal/execution`,
                                        {
                                          method: "POST",
                                          body: JSON.stringify({
                                            approval_id: reversalApproval.id,
                                            capture_id: workspace.capture.id,
                                          }),
                                        },
                                        "Reversing and verifying destination readback",
                                      )
                                    }
                                    type="button"
                                  >
                                    <Prohibit aria-hidden="true" size={17} />
                                    Remove item and verify
                                  </button>
                                  <button
                                    className="context-text-button"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                      mutate(
                                        `/api/local-integration/effect-reversal-approvals/${reversalApproval.id}/revocation`,
                                        {
                                          method: "POST",
                                          body: JSON.stringify({
                                            capture_id: workspace.capture.id,
                                          }),
                                        },
                                        "Revoking the reversal approval",
                                      )
                                    }
                                    type="button"
                                  >
                                    <X aria-hidden="true" size={16} />
                                    Revoke reversal approval
                                  </button>
                                </div>
                                <small>
                                  Approval changes no destination state. The
                                  removal still requires the separate action
                                  above and a matching absence readback.
                                </small>
                              </div>
                            ) : (
                              <>
                                {reversalAttempt?.outcome?.status ===
                                "failed" ? (
                                  <div
                                    className="context-effect-reversal__blocked"
                                    role="alert"
                                  >
                                    <Warning aria-hidden="true" size={18} />
                                    <p>
                                      <strong>Nothing was removed.</strong>{" "}
                                      {reversalAttempt.outcome.summary} Open a
                                      fresh review before deciding again.
                                    </p>
                                  </div>
                                ) : null}

                                {!reversalPreview ? (
                                  <button
                                    className="context-secondary-button"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                      void reviewEffectReversal()
                                    }
                                    type="button"
                                  >
                                    <ArrowRight aria-hidden="true" size={17} />
                                    Review reversal
                                  </button>
                                ) : (
                                  <div className="context-effect-reversal__preview">
                                    <dl>
                                      <div>
                                        <dt>Remove</dt>
                                        <dd>
                                          {reversalPreview.reversal.title}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt>From</dt>
                                        <dd>
                                          {reversalPreview.target.label}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt>Current version</dt>
                                        <dd>
                                          {
                                            reversalPreview.expected_destination_version
                                          }
                                        </dd>
                                      </div>
                                      <div>
                                        <dt>Preserve</dt>
                                        <dd>
                                          Original effect and both audit receipts
                                        </dd>
                                      </div>
                                    </dl>

                                    {reversalPreview.blockers.length > 0 ? (
                                      <div
                                        className="context-effect-reversal__blocked"
                                        role="alert"
                                      >
                                        <Warning
                                          aria-hidden="true"
                                          size={18}
                                        />
                                        <div>
                                          <strong>Automatic reversal paused</strong>
                                          {reversalPreview.blockers.map(
                                            (blocker) => (
                                              <p key={blocker.code}>
                                                {blocker.message}
                                              </p>
                                            ),
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="context-effect-reversal__decision">
                                        <label htmlFor="effect-reversal-reason">
                                          Why should this item be removed?
                                        </label>
                                        <textarea
                                          id="effect-reversal-reason"
                                          onChange={(event) => {
                                            setReversalReason(
                                              event.target.value,
                                            );
                                            reversalApprovalRequestRef.current =
                                              null;
                                          }}
                                          placeholder="Record the recruiter-observed reason."
                                          rows={3}
                                          value={reversalReason}
                                        />
                                        <label>
                                          <input
                                            checked={reversalReviewed}
                                            onChange={(event) =>
                                              setReversalReviewed(
                                                event.target.checked,
                                              )
                                            }
                                            type="checkbox"
                                          />
                                          <span>
                                            I reviewed the exact item,
                                            destination, current version, and
                                            preserved audit history.
                                          </span>
                                        </label>
                                        <div className="context-effect-reversal__actions">
                                          <button
                                            className="context-primary-button"
                                            disabled={
                                              Boolean(busy) ||
                                              !reversalReviewed ||
                                              !reversalReason.trim()
                                            }
                                            onClick={() =>
                                              void approveCurrentEffectReversal()
                                            }
                                            type="button"
                                          >
                                            <ShieldCheck
                                              aria-hidden="true"
                                              size={17}
                                            />
                                            Approve exact reversal
                                          </button>
                                          <button
                                            className="context-text-button"
                                            disabled={Boolean(busy)}
                                            onClick={() => {
                                              setReversalPreview(null);
                                              setReversalReviewed(false);
                                              reversalApprovalRequestRef.current =
                                                null;
                                            }}
                                            type="button"
                                          >
                                            Keep item
                                          </button>
                                        </div>
                                        <small>
                                          This approval grants no other action
                                          and does not remove the item yet.
                                        </small>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </section>
                        ) : null}
                      </>
                    ) : !sourceAuthorizationAvailable ? (
                      <div className="context-next-move__empty">
                        <Warning aria-hidden="true" size={23} />
                        <p>
                          <strong>No action authority is available.</strong>
                          Restore or renew the source, then review every
                          returned proposal before considering a new action.
                        </p>
                      </div>
                    ) : (
                      <div className="context-next-move__empty">
                        <CheckCircle aria-hidden="true" size={23} />
                        <p>
                          <strong>No action is supported yet.</strong>
                          Keep the context, or capture the next conversation
                          when something operational changes.
                        </p>
                      </div>
                    )}
                  </section>

                  <section className="context-history">
                    <div className="context-history__heading">
                      <div>
                        <p className="eyebrow">RELATIONSHIP HISTORY</p>
                        <h2>Evidence to outcome</h2>
                      </div>
                      <Clock aria-hidden="true" size={19} />
                    </div>
                    <ol>
                      {timeline.map((item) => (
                        <li data-state={item.state} key={item.id}>
                          <i aria-hidden="true" />
                          <div>
                            <strong>{item.label}</strong>
                            <p>{item.detail}</p>
                            <time dateTime={item.time}>
                              {formatDate(item.time)}
                            </time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section className="context-danger-zone">
                    <button
                      className="context-text-button"
                      onClick={() => setDeleteConfirm((current) => !current)}
                      type="button"
                    >
                      <Trash aria-hidden="true" size={16} />
                      Delete governed source
                    </button>
                    {deleteConfirm ? (
                      <div>
                        <p>
                          This removes source text and registered derivatives.
                          Audit-safe identifiers remain without conversation
                          content.
                        </p>
                        <button
                          className="context-secondary-button"
                          onClick={() => setDeleteConfirm(false)}
                          type="button"
                        >
                          Keep source
                        </button>
                        <button
                          className="context-danger-button"
                          disabled={Boolean(busy)}
                          onClick={deleteCapture}
                          type="button"
                        >
                          <Trash aria-hidden="true" size={16} />
                          Delete now
                        </button>
                      </div>
                    ) : null}
                  </section>
                </aside>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {captureOpen ? (
        <CapturePanel
          onClose={() => setCaptureOpen(false)}
          onCommitted={handleCommitted}
        />
      ) : null}
    </>
  );
}
