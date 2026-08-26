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
  AddressBook,
  ArrowRight,
  CheckCircle,
  CircleNotch,
  Clock,
  LinkSimple,
  Plus,
  ShieldCheck,
  Sparkle,
  UserPlus,
} from "@phosphor-icons/react";

import { AgentCreatePersonCard } from "./agent-create-person-card";
import { AgentIdentityReviewCard } from "./agent-identity-review-card";
import { initials } from "./relationship-display";
import {
  relationshipBriefContinuityReceipt,
  RelationshipHistoryTimeline,
} from "./relationship-history";
import type { RelationshipAgentOperation } from "./use-relationship-agent-controller";

type Props = {
  busyLabel: string;
  createOpen: boolean;
  history: RelationshipAgentHistory | null;
  identityResolutionCase: IdentityResolutionCase | null;
  mode: "relationship" | "review";
  objective: string;
  onAsk: () => void;
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
  onReviewSources: () => void;
  onRunCommand: (objective: string) => boolean;
  operation: RelationshipAgentOperation | null;
  pendingCount: number;
  response: ChatTaskResponse | null;
  scope: Pick<RelationshipScope, "person" | "relationship_context">;
  submittedObjective: string;
};

export function RelationshipAgentPanel({
  busyLabel,
  createOpen,
  history,
  identityResolutionCase,
  mode,
  objective,
  onAsk,
  onCancelCreate,
  onIdentityCaseUpdated,
  onIdentityDeferred,
  onIdentityResolved,
  onInitialResourcesCommitted,
  onObjectiveChange,
  onReviewMerge,
  onReviewSources,
  onRunCommand,
  operation,
  pendingCount,
  response,
  scope,
  submittedObjective,
}: Props) {
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
        <p className="eyebrow">RELATIONSHIP AGENT</p>
        <h1 id="relationship-chat-title">Ask, navigate, or change this page.</h1>
        <p>
          {reviewMode
            ? "I am scoped to this person and relationship. Every answer and proposed change keeps its source boundary."
            : "I am scoped to this person and relationship. Page changes remain staged until you review them."}
        </p>
      </div>
      <div className="context-agent-actions">
        {reviewMode ? (
          <button
            disabled={pendingCount === 0}
            onClick={() => onRunCommand("Review pending changes")}
            type="button"
          >
            <CheckCircle aria-hidden="true" size={15} />
            {pendingCount > 0
              ? `Review ${pendingCount} ${
                  pendingCount === 1 ? "change" : "changes"
                }`
              : "No changes waiting"}
          </button>
        ) : null}
        <button onClick={() => onRunCommand("Add a source")} type="button">
          <Plus aria-hidden="true" size={15} />
          Add source
        </button>
        {reviewMode ? (
          <button
            onClick={() => onRunCommand("Show the next move")}
            type="button"
          >
            <ArrowRight aria-hidden="true" size={15} />
            Next move
          </button>
        ) : null}
        <button
          data-active={createOpen}
          onClick={() => onRunCommand("Create a contact")}
          type="button"
        >
          <UserPlus aria-hidden="true" size={15} />
          Create contact
        </button>
        <button
          onClick={() => onRunCommand("Review a possible duplicate")}
          type="button"
        >
          <AddressBook aria-hidden="true" size={15} />
          Review duplicate
        </button>
      </div>

      {identityResolutionCase ? (
        <AgentIdentityReviewCard
          identityCase={identityResolutionCase}
          onCaseUpdated={onIdentityCaseUpdated}
          onResolved={onIdentityResolved}
        />
      ) : createOpen ? (
        <AgentCreatePersonCard
          onCancel={onCancelCreate}
          onCommitted={onInitialResourcesCommitted}
          onDeferred={onIdentityDeferred}
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
        <label>
          <span className="sr-only">Ask about this relationship</span>
          <textarea
            maxLength={1_000}
            onChange={(event) => onObjectiveChange(event.target.value)}
            rows={2}
            value={objective}
          />
        </label>
        <button
          className="context-primary-button"
          disabled={!objective.trim() || Boolean(busyLabel)}
          type="submit"
        >
          {busyLabel === "Compiling a source-linked brief" ? (
            <CircleNotch aria-hidden="true" className="spin" size={18} />
          ) : (
            <Sparkle aria-hidden="true" size={18} weight="fill" />
          )}
          Ask Agent
        </button>
      </form>

      {response ? (
        <div className="context-chat__response">
          <p className="context-agent-user-message">{submittedObjective}</p>
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
