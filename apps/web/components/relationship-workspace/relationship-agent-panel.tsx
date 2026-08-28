"use client";

import type {
  ChatTaskResponse,
  IdentityResolutionCase,
  KnowledgeSnapshot,
  RelationshipAgentHistory,
  RelationshipScope,
  ResourceCaptureResponse,
} from "@talent-signal/contracts";
import {
  ArrowRight,
  ArrowUp,
  CircleNotch,
  Clock,
  FileText,
  ImageSquare,
  LinkSimple,
  Paperclip,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react";
import { useRef } from "react";

import { AgentCreatePersonCard } from "./agent-create-person-card";
import { AgentIdentityReviewCard } from "./agent-identity-review-card";
import { initials } from "./relationship-display";
import {
  relationshipBriefContinuityReceipt,
  RelationshipHistoryTimeline,
} from "./relationship-history";
import {
  RelationshipChatMediaAlbum,
  RelationshipChatMediaDraftTray,
} from "./relationship-chat-media";
import type {
  RelationshipAgentOperation,
  RelationshipChatMediaDraft,
} from "./use-relationship-agent-controller";
import type { AgentContactDraft } from "@/lib/agent-contact-intake";
import { AgentVoiceInput } from "./agent-voice-input";

type Props = {
  busyLabel: string;
  contactDraft: AgentContactDraft | null;
  createOpen: boolean;
  history: RelationshipAgentHistory | null;
  identityResolutionCase: IdentityResolutionCase | null;
  mode: "relationship" | "review";
  objective: string;
  onAsk: () => void;
  onMediaSelected: (files: FileList | File[]) => void;
  onRemoveMedia: (clientId: string) => void;
  onRetryMedia: (clientId: string) => void;
  onCancelCreate: () => void;
  onIdentityCaseUpdated: (nextCase: IdentityResolutionCase) => void;
  onIdentityDeferred: (caseId: string) => void;
  onIdentityResolved: (
    scope: RelationshipScope,
    compilation: KnowledgeSnapshot | null,
    compilationError: string | null,
  ) => void;
  onInitialResourcesCommitted: (
    scope: RelationshipScope,
    receipts: ResourceCaptureResponse[],
    outcome:
      | "created_person"
      | "created_relationship_context"
      | "reused_relationship",
  ) => void;
  onObjectiveChange: (value: string) => void;
  onReviewMerge: (operationId: string) => void;
  onReviewDuplicates: () => void;
  onReviewSources: () => void;
  onRunCommand: (objective: string) => boolean;
  operation: RelationshipAgentOperation | null;
  pendingCount: number;
  mediaDrafts: RelationshipChatMediaDraft[];
  response: ChatTaskResponse | null;
  scope: Pick<RelationshipScope, "person" | "relationship_context">;
  submittedObjective: string;
};

export function RelationshipAgentPanel({
  busyLabel,
  contactDraft,
  createOpen,
  history,
  identityResolutionCase,
  mode,
  objective,
  onAsk,
  onMediaSelected,
  onRemoveMedia,
  onRetryMedia,
  onCancelCreate,
  onIdentityCaseUpdated,
  onIdentityDeferred,
  onIdentityResolved,
  onInitialResourcesCommitted,
  onObjectiveChange,
  onReviewMerge,
  onReviewDuplicates,
  onReviewSources,
  onRunCommand,
  operation,
  pendingCount,
  mediaDrafts,
  response,
  scope,
  submittedObjective,
}: Props) {
  const attachmentMenuRef = useRef<HTMLDetailsElement>(null);
  const reviewMode = mode === "review";
  const priorBrief =
    !response && !operation
      ? relationshipBriefContinuityReceipt(history)
      : null;

  return (
    <section
      aria-labelledby="relationship-chat-title"
      className="context-chat"
      id="relationship-chat"
    >
      <div className="context-chat__scope">
        <span>{initials(scope.person.display_label)}</span>
        <p>
          <strong>{scope.person.display_label}</strong>
          <small>{scope.relationship_context.display_label}</small>
        </p>
        <i>
          <ShieldCheck aria-hidden="true" size={15} weight="duotone" />
          Scoped
        </i>
      </div>
      <div className="context-chat__intro">
        <p className="eyebrow">RELATIONSHIP THREAD</p>
        <h1 id="relationship-chat-title">Say it naturally.</h1>
        <p>
          Ask a question, paste a relationship update, or add a person. Agent
          checks the current page and prepares any consequential change for
          review.
        </p>
      </div>

      {identityResolutionCase ? (
        <AgentIdentityReviewCard
          identityCase={identityResolutionCase}
          onCaseUpdated={onIdentityCaseUpdated}
          onResolved={onIdentityResolved}
        />
      ) : createOpen ? (
        <AgentCreatePersonCard
          currentPersonId={scope.person.id}
          initialDraft={contactDraft}
          key={contactDraft?.sourceNote ?? "manual-contact-draft"}
          onCancel={onCancelCreate}
          onCommitted={onInitialResourcesCommitted}
          onDeferred={onIdentityDeferred}
          onReviewDuplicates={onReviewDuplicates}
        />
      ) : operation ? (
        <div
          className="context-agent-operation"
          data-status={operation.status}
        >
          <p className="context-agent-user-message">{submittedObjective}</p>
          <article>
            <header>
              <span>
                {operation.status === "staged"
                  ? "Staged"
                  : operation.status === "no_change"
                    ? "No change"
                    : "Completed"}
              </span>
              <i>Page operation</i>
            </header>
            <strong>{operation.title}</strong>
            <p>{operation.detail}</p>
          </article>
        </div>
      ) : reviewMode && pendingCount > 0 ? (
        <div className="context-agent-page-update">
          <header>
            <span>
              <Sparkle aria-hidden="true" size={15} weight="fill" />
            </span>
            <div>
              <strong>Page changes are waiting</strong>
              <p>
                {pendingCount} source-linked facts are staged on the living
                page.
              </p>
            </div>
            <i>Not applied</i>
          </header>
          <button
            className="context-primary-button context-primary-button--compact"
            onClick={() => onRunCommand("Review pending changes")}
            type="button"
          >
            Review on page
            <ArrowRight aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}

      <RelationshipHistoryTimeline
        history={history}
        onReviewMerge={onReviewMerge}
      />

      {priorBrief ? (
        <div className="context-agent-page-update" data-kind="continuity">
          <header>
            <span>
              <Clock aria-hidden="true" size={15} weight="duotone" />
            </span>
            <div>
              <strong>
                {priorBrief.stale
                  ? "An earlier brief is no longer current"
                  : "An earlier brief is recorded"}
              </strong>
              <p>
                {priorBrief.detail} Audit history preserves this scoped receipt,
                not the answer body. Ask again to compile against currently
                authorized evidence.
              </p>
            </div>
            <i>Receipt only</i>
          </header>
        </div>
      ) : null}

      <form
        className="context-chat__composer"
        onSubmit={(event) => {
          event.preventDefault();
          onAsk();
        }}
      >
        <RelationshipChatMediaDraftTray
          drafts={mediaDrafts}
          onRemove={onRemoveMedia}
          onRetry={onRetryMedia}
        />
        <div className="context-chat__composer-row">
          <details
            className="context-chat__attachment-menu"
            ref={attachmentMenuRef}
          >
            <summary aria-label="Add an attachment or governed source">
              <Paperclip aria-hidden="true" size={19} weight="duotone" />
            </summary>
            <div className="context-chat__attachment-popover">
              <label>
                <ImageSquare aria-hidden="true" size={18} weight="duotone" />
                <span>
                  <strong>Task images</strong>
                  <small>Use only for this Agent request</small>
                </span>
                <input
                  accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                  multiple
                  onChange={(event) => {
                    if (event.target.files?.length) {
                      onMediaSelected(event.target.files);
                    }
                    event.target.value = "";
                    attachmentMenuRef.current?.removeAttribute("open");
                  }}
                  type="file"
                />
              </label>
              <button
                onClick={() => {
                  attachmentMenuRef.current?.removeAttribute("open");
                  onReviewSources();
                }}
                type="button"
              >
                <FileText aria-hidden="true" size={18} weight="duotone" />
                <span>
                  <strong>Governed source</strong>
                  <small>Keep provenance and a deletion path</small>
                </span>
              </button>
            </div>
          </details>
          <label className="context-chat__objective">
            <span className="sr-only">Ask about this relationship</span>
            <textarea
              id="relationship-agent-composer"
              maxLength={1_000}
              onChange={(event) => onObjectiveChange(event.target.value)}
              placeholder="Message, paste, or add anything…"
              rows={2}
              value={objective}
            />
          </label>
          {objective.trim() ? (
            <button
              className="context-primary-button"
              disabled={
                Boolean(busyLabel) ||
                mediaDrafts.some((draft) => draft.status !== "ready")
              }
              type="submit"
            >
              {busyLabel === "Compiling a source-linked brief" ? (
                <CircleNotch aria-hidden="true" className="spin" size={18} />
              ) : (
                <ArrowUp aria-hidden="true" size={18} weight="bold" />
              )}
              <span className="sr-only">Send to Agent</span>
            </button>
          ) : (
            <AgentVoiceInput
              disabled={Boolean(busyLabel)}
              onTranscript={(transcript) =>
                onObjectiveChange(transcript.slice(0, 1_000))
              }
            />
          )}
        </div>
      </form>

      {response ? (
        <div className="context-chat__response">
          <div className="context-agent-user-turn">
            <p className="context-agent-user-message">{submittedObjective}</p>
            <RelationshipChatMediaAlbum media={response.media ?? []} />
          </div>
          <div className="context-chat__response-meta">
            <span>Snapshot {response.knowledge_snapshot_id.slice(0, 8)}</span>
            <span>Manifest {response.context_manifest_id.slice(0, 8)}</span>
            <span>{response.disposition.replaceAll("_", " ")}</span>
          </div>
          {response.blocks.map((block) => (
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
                  {block.citation_dependency_ids.length === 1
                    ? "reference"
                    : "references"}
                </span>
                {block.requires_user_decision ? (
                  reviewMode ? (
                    <a href="#next-move">
                      Review before acting
                      <ArrowRight aria-hidden="true" size={14} />
                    </a>
                  ) : (
                    <a
                      href="#relationship-resources"
                      onClick={(event) => {
                        event.preventDefault();
                        onReviewSources();
                      }}
                    >
                      Review source
                      <ArrowRight aria-hidden="true" size={14} />
                    </a>
                  )
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <p className="context-chat__empty">
          {reviewMode
            ? "Nothing is synthesized until you ask. Proposed facts stay visible as review items; generated actions never execute from Chat."
            : "Ask when you need a brief. The source ledger remains the stable object; Chat is a task-specific view over it."}
        </p>
      )}
    </section>
  );
}
