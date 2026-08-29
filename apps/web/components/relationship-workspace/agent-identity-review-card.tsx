"use client";

import {
  CONTRACT_VERSION,
  type IdentityResolutionCase,
  type IdentityResolutionDecisionResponse,
  type KnowledgeSnapshot,
  type RelationshipScope,
} from "@talent-signal/contracts";
import {
  Check,
  CheckCircle,
  CircleNotch,
  Plus,
  Warning,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { relationshipIntegrationFetch } from "@/components/workspace-session-request";

type IdentityWorkflowResponse = {
  decision: IdentityResolutionDecisionResponse;
  identity_case: IdentityResolutionCase;
  compilation: KnowledgeSnapshot | null;
  compilation_error: string | null;
};

function formatIdentityReviewDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function identityReviewInitials(value: string) {
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

export function AgentIdentityReviewCard({
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
    if (!reason.trim() || (decision === "bind_existing" && !bindReady)) {
      setError(
        decision === "leave_unresolved"
          ? "保存以供稍后处理前，请说明仍缺少什么证据。"
          : "请选择一位联系人、一项关系情境，并解释身份决定。",
      );
      return;
    }
    requestIdRef.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
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
                  relationship_context: usingNewContext
                    ? {
                        status: "proposed",
                        label: newContextLabel.trim(),
                        purpose:
                          "身份审阅后由招聘顾问定义的关系情境",
                      }
                    : {
                        status: "existing",
                        relationship_context_id: selectedExistingContext?.id,
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
            : "无法保存身份决定。",
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
                "所选关系",
          },
        },
        payload.compilation,
        payload.compilation_error,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "无法保存身份决定。",
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
            身份仍需要你的决定
          </strong>
          <p>
            来源已保存，但尚未进入任何人物的 Wiki。
          </p>
        </div>
        <i>未解决</i>
      </header>

      {identityCase.latest_decision?.decision === "leave_unresolved" ? (
        <div className="context-agent-identity-review__resume">
          <strong>先前保持为未解决</strong>
          <p>{identityCase.latest_decision.reason}</p>
          <small>
            保存于 {formatIdentityReviewDate(identityCase.latest_decision.decided_at)}
          </small>
        </div>
      ) : null}

      <article className="context-agent-identity-review__source">
        <header>
          <span>受治理来源</span>
          <i>{identityCase.source.display_name}</i>
        </header>
        <blockquote>{identityCase.source.excerpt}</blockquote>
        <footer>
          <span>{identityCase.source.kind.replaceAll("_", " ")}</span>
          <span>
            {identityCase.source.fragment_count}{" "}
            条片段
          </span>
          <span>{formatIdentityReviewDate(identityCase.source.observed_at)}</span>
        </footer>
      </article>

      <div className="context-agent-identity-review__candidates">
        <p>
          只比较有来源支持的身份线索与关系情境。选择联系人并不确认来源中的结论。
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
              <span>{identityReviewInitials(candidate.display_label)}</span>
              <p>
                <strong>{candidate.display_label}</strong>
                <small>
                  {candidate.context_count}{" "}
                  {candidate.context_count === 1
                    ? "项关系"
                    : "项关系"}{" "}
                  · {candidate.capture_count} 份来源
                </small>
              </p>
              <CheckCircle aria-hidden="true" size={17} />
            </button>
            <ul aria-label={`${candidate.display_label} 可能匹配的原因`}>
              {candidate.match_reasons.map((matchReason) => (
                <li key={matchReason}>{matchReason}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {selectedCandidate ? (
        <fieldset className="context-agent-identity-review__contexts">
          <legend>关系情境</legend>
          <p>
            身份可以共享；证据仍限定在所选关系内。
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
              新关系
            </button>
          </div>
          {usingNewContext ? (
            <label>
              <span>新关系标签</span>
              <input
                maxLength={200}
                onChange={(event) => {
                  setNewContextLabel(event.target.value);
                  resetRequest();
                }}
                placeholder="例如：产品副总裁寻访"
                value={newContextLabel}
              />
            </label>
          ) : null}
        </fieldset>
      ) : null}

      <label className="context-agent-identity-review__reason">
        <span>
          决定笔记 <small>必填</small>
        </span>
        <textarea
          maxLength={500}
          onChange={(event) => {
            setReason(event.target.value);
            resetRequest();
          }}
          placeholder="什么能够区分正确联系人，或仍缺少什么证据？"
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
          保持未解决
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
          确认身份
        </button>
      </footer>
    </section>
  );
}
