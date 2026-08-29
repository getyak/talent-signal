import type {
  IdentityResolutionCase,
  KnowledgeSnapshot,
  RelationshipScope,
  ResourceCaptureResponse,
} from "@talent-signal/contracts";
import {
  ArrowUp,
  ChatCircleDots,
  FileImage,
} from "@phosphor-icons/react";

import { AgentCreatePersonCard } from "./agent-create-person-card";
import { AgentIdentityReviewCard } from "./agent-identity-review-card";
import type { AgentContactDraft } from "@/lib/agent-contact-intake";
import { AgentVoiceInput } from "./agent-voice-input";

export function RelationshipAgentStartPanel({
  createOpen,
  contactDraft,
  identityResolutionCase,
  objective,
  onAsk,
  onCancelCreate,
  onCaseUpdated,
  onCommitted,
  onDeferred,
  onResolved,
  onScreenshot,
  onObjectiveChange,
}: {
  createOpen: boolean;
  contactDraft: AgentContactDraft | null;
  identityResolutionCase: IdentityResolutionCase | null;
  objective: string;
  onAsk: () => void;
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
  onDeferred: (caseId: string) => void;
  onResolved: (
    scope: RelationshipScope,
    compilation: KnowledgeSnapshot | null,
    compilationError: string | null,
  ) => void;
  onScreenshot: () => void;
  onObjectiveChange: (value: string) => void;
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
          <p>关系智能助理</p>
          <strong id="relationship-chat-title">
            从一条消息开始。
          </strong>
        </div>
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
            initialDraft={contactDraft}
            key={contactDraft?.sourceNote ?? "manual-contact-draft"}
            onCancel={onCancelCreate}
            onCommitted={onCommitted}
            onDeferred={onDeferred}
          />
        ) : (
          <div className="context-agent-welcome">
            <span><ChatCircleDots aria-hidden="true" size={16} /></span>
            <div>
              <strong>像给同事发消息一样，自然地添加联系人。</strong>
              <p>
                “添加 Maya Chen 到首席产品官寻访。Elena 推荐了她，她下周二可以沟通。”我会先检查联系人目录，再准备创建、关联或身份审阅。任何状态都不会静默改变。
              </p>
            </div>
          </div>
        )}
      </div>
      <form
        className="context-chat__composer context-chat__composer--start"
        onSubmit={(event) => {
          event.preventDefault();
          onAsk();
        }}
      >
        <div className="context-chat__composer-row">
          <button
            aria-label="导入对话截图"
            className="context-chat__media-picker"
            onClick={onScreenshot}
            type="button"
          >
            <FileImage aria-hidden="true" size={19} weight="duotone" />
          </button>
          <label className="context-chat__objective">
            <span className="sr-only">给关系智能助理发消息</span>
            <textarea
              autoFocus
              id="relationship-agent-composer"
              maxLength={1_000}
              onChange={(event) => onObjectiveChange(event.target.value)}
              placeholder="输入消息、粘贴内容或添加任何资料…"
              rows={2}
              value={objective}
            />
          </label>
          {objective.trim() ? (
            <button
              aria-label="发送给智能助理"
              className="context-primary-button"
              type="submit"
            >
              <ArrowUp aria-hidden="true" size={18} weight="bold" />
            </button>
          ) : (
            <AgentVoiceInput
              onTranscript={(transcript) =>
                onObjectiveChange(transcript.slice(0, 1_000))
              }
            />
          )}
        </div>
      </form>
    </aside>
  );
}
