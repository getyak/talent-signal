import type {
  IdentityResolutionCase,
  KnowledgeSnapshot,
  RelationshipScope,
  ResourceCaptureResponse,
} from "@talent-signal/contracts";
import {
  ArrowRight,
  ChatCircleDots,
  FileImage,
  Sparkle,
  UserPlus,
} from "@phosphor-icons/react";

import { AgentCreatePersonCard } from "./agent-create-person-card";
import { AgentIdentityReviewCard } from "./agent-identity-review-card";

export function RelationshipAgentStartPanel({
  createOpen,
  identityResolutionCase,
  onCancelCreate,
  onCaseUpdated,
  onCommitted,
  onCreateOpen,
  onDeferred,
  onResolved,
  onScreenshot,
}: {
  createOpen: boolean;
  identityResolutionCase: IdentityResolutionCase | null;
  onCancelCreate: () => void;
  onCaseUpdated: (nextCase: IdentityResolutionCase) => void;
  onCommitted: (
    scope: RelationshipScope,
    receipts: ResourceCaptureResponse[],
    outcome:
      | "created_person"
      | "created_relationship_context"
      | "reused_relationship",
  ) => void;
  onCreateOpen: () => void;
  onDeferred: (caseId: string) => void;
  onResolved: (
    scope: RelationshipScope,
    compilation: KnowledgeSnapshot | null,
    compilationError: string | null,
  ) => void;
  onScreenshot: () => void;
}) {
  return (
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
        <button data-active={createOpen} onClick={onCreateOpen} type="button">
          <UserPlus aria-hidden="true" size={15} />
          Create contact
        </button>
        <button onClick={onScreenshot} type="button">
          <FileImage aria-hidden="true" size={15} />
          Import screenshot
        </button>
      </div>
      <div className="context-agent-thread">
        {identityResolutionCase ? (
          <AgentIdentityReviewCard
            identityCase={identityResolutionCase}
            onCaseUpdated={onCaseUpdated}
            onResolved={onResolved}
          />
        ) : createOpen ? (
          <AgentCreatePersonCard
            onCancel={onCancelCreate}
            onCommitted={onCommitted}
            onDeferred={onDeferred}
          />
        ) : (
          <div className="context-agent-welcome">
            <span>
              <Sparkle aria-hidden="true" size={16} weight="fill" />
            </span>
            <div>
              <strong>Give me the first governed source.</strong>
              <p>
                I can stage a new person and relationship page. You decide the
                identity, context, and source before anything is created.
              </p>
              <button
                className="context-primary-button context-primary-button--compact"
                onClick={onCreateOpen}
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
        Open or create a relationship to ask questions and operate its page.
      </footer>
    </aside>
  );
}
