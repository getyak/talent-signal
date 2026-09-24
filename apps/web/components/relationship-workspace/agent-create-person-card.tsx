"use client";

import {
  maskIdentityHandle,
  parseIdentityHandleQuery,
  type IdentityHandleType,
  type PersonDirectoryItem,
  type RelationshipScope,
  type ResourceCaptureResponse,
} from "@talent-signal/contracts";
import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  Clock,
  Plus,
  ShieldCheck,
  UserPlus,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type AgentPersonOutcome,
  type AgentPersonTarget,
  agentPersonOutcome,
  agentPersonScopeFields,
  agentRelationshipContexts,
  canCreateDistinctPerson,
  canSelectPersonForIdentityClue,
  confirmedHandlePersonMatches,
  exactPersonNameMatches,
  expiredHandlePersonMatches,
  mergePersonDirectoryMatches,
  personIdentityTemporalRole,
} from "@/lib/agent-person-resolution";
import { relationshipIntegrationFetch } from "@/components/workspace-session-request";
import type { AgentContactDraft } from "@/lib/agent-contact-intake";

// Every resource POST keeps its own stable request identity: the request ID
// (server idempotency) and the client-attested observation time travel
// together. Both survive same-intent retries and reset together when the
// draft intent changes, so a retry can never invent a new observation time or
// duplicate an already-committed person or note.
type ResourceRequestIdentity = { requestId: string; capturedAt: string };
// Frozen after the first source commits: partial-success recovery may only
// complete the missing confirmed clue against this exact saved identity and
// these frozen labels — never create another person or note, and never
// retarget the committed person from a later directory search.
type CommittedPersonSource = {
  scope: RelationshipScope;
  receipt: ResourceCaptureResponse;
  outcome: AgentPersonOutcome;
};
function ensureRequestIdentity(ref: {
  current: ResourceRequestIdentity | null;
}): ResourceRequestIdentity {
  ref.current ??= {
    requestId: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
  };
  return ref.current;
}

function identityHandleLabel(type: IdentityHandleType) {
  switch (type) {
    case "email":
      return "邮箱";
    case "phone":
      return "电话";
    case "wechat":
      return "WeChat";
    case "linkedin_url":
      return "LinkedIn";
    case "public_profile_url":
      return "公开资料页";
    case "source_native_id":
      return "来源 ID";
  }
}
function personInitials(value: string) {
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

export function AgentCreatePersonCard({
  currentPersonId,
  initialDraft,
  onCancel,
  onCommitted,
  onDeferred,
  onReviewDuplicates,
}: {
  currentPersonId?: string;
  initialDraft?: AgentContactDraft | null;
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
  onReviewDuplicates?: () => void;
}) {
  const sourceRequestRef = useRef<ResourceRequestIdentity | null>(null);
  const handleRequestRef = useRef<ResourceRequestIdentity | null>(null);
  const deferRequestRef = useRef<ResourceRequestIdentity | null>(null);
  function resetDraftRequests() {
    sourceRequestRef.current = null;
    handleRequestRef.current = null;
    deferRequestRef.current = null;
  }
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [identityClue, setIdentityClue] = useState(
    initialDraft?.identityClue ?? "",
  );
  const [identityClueConfirmed, setIdentityClueConfirmed] =
    useState(false);
  const [contextLabel, setContextLabel] = useState(
    initialDraft?.relationshipContext ?? "",
  );
  const [firstNote, setFirstNote] = useState(
    initialDraft?.sourceNote ?? "",
  );
  const [matches, setMatches] = useState<PersonDirectoryItem[]>([]);
  const [lookupState, setLookupState] = useState<
    "error" | "idle" | "loading" | "ready"
  >(initialDraft?.name || initialDraft?.identityClue ? "loading" : "idle");
  const [lookupRevision, setLookupRevision] = useState(0);
  const [target, setTarget] = useState<AgentPersonTarget>({
    mode: "new_person",
  });
  const [differentPersonConfirmed, setDifferentPersonConfirmed] =
    useState(false);
  const [identityDetailsOpen, setIdentityDetailsOpen] = useState(
    !initialDraft || !initialDraft.name || !initialDraft.relationshipContext,
  );
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(
    !initialDraft ||
      !initialDraft.relationshipContext ||
      !initialDraft.sourceNote,
  );
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [committedSource, setCommittedSource] =
    useState<CommittedPersonSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);
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
  const currentPersonMatches = currentPersonId
    ? exactMatches.some((person) => person.id === currentPersonId)
    : false;
  const duplicateMatches = currentPersonMatches
    ? exactMatches.filter((person) => person.id !== currentPersonId)
    : [];
  const confirmedHandleMatches =
    confirmedHandlePersonMatches(matches);
  const expiredHandleMatches = expiredHandlePersonMatches(matches);
  const visibleMatches = showAllMatches ? matches : matches.slice(0, 3);
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
          const response = await relationshipIntegrationFetch(
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
                : "无法检查现有人才。",
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
    // After the first source committed, retries only complete the missing
    // confirmed clue against that exact saved identity: never a second
    // person or note, never a person retargeted by a later search.
    if (committedSource) {
      await completeSavedPerson();
      return;
    }
    if (!ready) {
      setError(
        lookupState === "error"
          ? "创建新身份前，请先检查现有人才。"
          : "请选择人物、关系背景和首个来源。",
      );
      return;
    }
    const sourceRequest = ensureRequestIdentity(sourceRequestRef);
    setBusy(true);
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
        "/api/local-integration/resources",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          request_id: sourceRequest.requestId,
          captured_at: sourceRequest.capturedAt,
          ...agentPersonScopeFields(target, name, contextLabel),
          type: "note",
          title:
            target.mode === "new_person"
              ? "你提供的首条背景"
              : "智能助理附加的、由你提供的背景",
          value: firstNote.trim(),
          }),
        },
      );
      const payload = (await response.json()) as
        | { receipts: ResourceCaptureResponse[] }
        | { message?: string };
      if (!response.ok || !("receipts" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "无法保存关系来源。",
        );
      }
      const first = payload.receipts[0];
      if (
        !first?.identity.person_id ||
        !first.identity.relationship_context_id
      ) {
        throw new Error(
          "打开人物页面前，此来源仍需完成身份审阅。",
        );
      }
      const personLabel =
        target.mode === "new_person"
          ? name.trim()
          : target.person.display_label;
      const savedContextLabel =
        target.mode === "existing_context"
          ? target.relationshipContext.display_label
          : contextLabel.trim();
      const scope: RelationshipScope = {
        contract_version: first.contract_version,
        person: {
          id: first.identity.person_id,
          display_label: personLabel,
        },
        relationship_context: {
          id: first.identity.relationship_context_id,
          display_label: savedContextLabel,
        },
      };
      const outcome = agentPersonOutcome(target);
      const receipts = [...payload.receipts];
      if (identityClueConfirmed && parsedIdentityClue) {
        // Freeze the committed person, scope and labels before the clue
        // attempt: a clue failure is only ever recoverable as a clue retry
        // against this identity.
        setCommittedSource({ scope, receipt: first, outcome });
        receipts.push(...(await saveConfirmedClue(scope)));
      }
      onCommitted(scope, receipts, outcome);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "无法保存关系来源。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveConfirmedClue(scope: RelationshipScope): Promise<
    ResourceCaptureResponse[]
  > {
    const handleRequest = ensureRequestIdentity(handleRequestRef);
    const handleResponse = await relationshipIntegrationFetch(
      "/api/local-integration/resources",
      {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: handleRequest.requestId,
          captured_at: handleRequest.capturedAt,
          scope_mode: "existing",
          person_id: scope.person.id,
          relationship_context_id: scope.relationship_context.id,
          type: "contact",
          value: identityClue.trim(),
          identity_clue_confirmed: true,
        }),
      },
    );
    const handlePayload = (await handleResponse.json()) as
      | { receipts: ResourceCaptureResponse[] }
      | { message?: string };
    if (!handleResponse.ok || !("receipts" in handlePayload)) {
      throw new Error(
        "关系来源已保存，但已确认身份线索未保存。请审阅或修改线索后重试，也可直接打开已保存的人物。",
      );
    }
    return handlePayload.receipts;
  }

  async function completeSavedPerson() {
    const saved = committedSource;
    if (!saved) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const receipts = [saved.receipt];
      if (identityClueConfirmed && parsedIdentityClue) {
        receipts.push(...(await saveConfirmedClue(saved.scope)));
      }
      onCommitted(saved.scope, receipts, saved.outcome);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "无法保存关系来源。",
      );
    } finally {
      setBusy(false);
    }
  }

  function openSavedPerson() {
    if (!committedSource) {
      return;
    }
    onCommitted(
      committedSource.scope,
      [committedSource.receipt],
      committedSource.outcome,
    );
  }

  async function deferIdentityReview() {
    if (!reviewReady) {
      setError(
        "保存身份审阅前，请添加预期的关系背景和首个来源。",
      );
      return;
    }
    const deferRequest = ensureRequestIdentity(deferRequestRef);
    setBusy(true);
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
        "/api/local-integration/resources",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          request_id: deferRequest.requestId,
          captured_at: deferRequest.capturedAt,
          scope_mode: "identity_candidates",
          candidate_person_ids: matches.map((person) => person.id),
          contact_name: name.trim(),
          relationship_context_label: contextLabel.trim(),
          type: "note",
          title: "你提供的、等待确认身份的来源",
          value: firstNote.trim(),
          }),
        },
      );
      const payload = (await response.json()) as
        | { receipts: ResourceCaptureResponse[] }
        | { message?: string };
      if (!response.ok || !("receipts" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "无法保存未解决来源。",
        );
      }
      const caseId =
        payload.receipts[0]?.identity.resolution_case_id ?? null;
      if (!caseId) {
        throw new Error(
          "来源已保存，但没有可继续处理的身份审阅案例。",
        );
      }
      onDeferred(caseId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "无法保存未解决来源。",
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
            {initialDraft ? "新联系人草稿" : "创建前先确认人物身份"}
          </strong>
          <p>
            {initialDraft
              ? "智能助理从你的消息中提取了一个提议。任何内容变化前，请审阅身份结果。"
              : "先查找现有身份，再绑定一段关系和一个来源。"}
          </p>
        </div>
        <button
          aria-label="取消人物草稿"
          className="context-icon-button"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={15} />
        </button>
      </header>
      {initialDraft ? (
        <div className="context-agent-create__draft-summary">
          <p>
            <strong>{name || "需要姓名"}</strong>
            <span>{contextLabel || "需要关系背景"}</span>
          </p>
          <small>{firstNote}</small>
          <i>
            {committedSource
              ? "人物与首条来源已保存 · 身份线索仍待处理"
              : "仅为提议 · 尚未发生任何变化"}
          </i>
        </div>
      ) : null}
      {error ? (
        <p
          className="context-agent-create__error"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          {error}
        </p>
      ) : null}
      {committedSource ? (
        <div className="context-agent-create__committed" role="status">
          <strong>
            已保存：{committedSource.scope.person.display_label} ·{" "}
            {committedSource.scope.relationship_context.display_label}
          </strong>
          <p>
            人物与首条来源已保存，不会重复创建或合并。
            下面仅剩尚未保存的已确认身份线索，可修改、取消确认或放弃。
          </p>
        </div>
      ) : null}
      <details
        className="context-agent-create__details"
        onToggle={(event) =>
          setIdentityDetailsOpen(event.currentTarget.open)
        }
        open={identityDetailsOpen}
      >
        <summary>{initialDraft ? "编辑已提取信息" : "联系人信息"}</summary>
      <label>
        <span>人物</span>
        <input
          autoComplete="off"
          disabled={Boolean(committedSource)}
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
            setShowAllMatches(false);
            resetDraftRequests();
          }}
          placeholder="例如：陈雅宁"
          value={name}
        />
      </label>
      <label>
        <span>
          已知身份线索 <small>可选</small>
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
            setShowAllMatches(false);
            resetDraftRequests();
          }}
          placeholder="邮箱、电话、LinkedIn 网址或 wechat:ID"
          value={identityClue}
        />
        <small>
          仅用于账号范围内的查找；结果不会返回原始值。
        </small>
      </label>
      {identityClue.trim() && !parsedIdentityClue ? (
        <p className="context-agent-create__error">
          请使用邮箱、电话、公开资料网址或明确的“wechat:ID”。
        </p>
      ) : null}
      </details>
      <div
        className="context-agent-identity-check"
        data-state={committedSource ? "resolved" : lookupState}
      >
        <header>
          <span>身份检查</span>
          <i>
            {committedSource
              ? "已确定"
              : lookupState === "loading"
                ? "检查中"
                : lookupState === "ready"
                  ? `${matches.length} 个可能匹配`
                  : lookupState === "error"
                    ? "不可用"
                    : "必需"}
          </i>
        </header>
        {committedSource ? (
          <p>
            身份已确定为 {committedSource.scope.person.display_label} ·{" "}
            {committedSource.scope.relationship_context.display_label}
            。不会再根据新的查找结果更改、合并或重新绑定此人物。
          </p>
        ) : lookupState === "idle" ? (
          <p>
            选择新建或现有身份前，请输入姓名或已知身份线索。
          </p>
        ) : lookupState === "loading" ? (
          <p>
            <CircleNotch aria-hidden="true" className="spin" size={13} />
            仅在你的账号内查找。
          </p>
        ) : lookupState === "error" ? (
          <div className="context-agent-identity-error">
            <p>
              无法检查现有人才，已暂停创建新身份。
            </p>
            <button
              className="context-secondary-button"
              onClick={() => {
                setLookupState("loading");
                setLookupRevision((value) => value + 1);
              }}
              type="button"
            >
              重试身份检查
            </button>
          </div>
        ) : matches.length > 0 ? (
          <div className="context-agent-person-matches">
            <p>
              已确认账号标识是当前身份依据。过期标识仅作为审阅线索；绑定仍由你决定。
            </p>
            {visibleMatches.map((person) => {
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
                  <span>{personInitials(person.display_label)}</span>
                  <p>
                    <strong>{person.display_label}</strong>
                    <small>
                      {person.context_count}{" "}
                      {person.context_count === 1
                        ? "段关系"
                        : "段关系"}{" "}
                      · {person.capture_count} 个来源
                    </small>
                  </p>
                  <i className="context-agent-temporal-status">
                    {temporalRole === "current" ? (
                      <>
                        <ShieldCheck aria-hidden="true" size={12} />
                        当前线索
                      </>
                    ) : temporalRole === "historical" ? (
                      <>
                        <Clock aria-hidden="true" size={12} />
                        历史线索
                      </>
                    ) : (
                      "仅姓名"
                    )}
                  </i>
                </header>
                <ul
                  aria-label={`${person.display_label} 的匹配原因`}
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
                        <>仅姓名匹配</>
                      ) : match.kind === "expired_handle" ? (
                        <>
                          <Clock aria-hidden="true" size={12} />
                          已过期{" "}
                          {identityHandleLabel(match.handle_type)} ·{" "}
                          {match.display_hint} · 需要新来源
                        </>
                      ) : (
                        <>
                          <ShieldCheck
                            aria-hidden="true"
                            size={12}
                          />
                          已确认{" "}
                          {identityHandleLabel(match.handle_type)} ·{" "}
                          {match.display_hint}
                          {match.source_resource_id
                            ? " · 已关联来源"
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
                        ? "当前已关联来源的权威身份。经你明确选择后，可在此附加新来源。"
                        : "当前没有归属者。只有结合新来源和你的明确选择，才能重新确认这条历史线索。"
                      : "仅用于对比。当另一个人持有当前归属时，不能将此来源附到这里。"}
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
                        resetDraftRequests();
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
                      resetDraftRequests();
                    }}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={13} />
                    新建关系
                  </button>
                </div>
                </article>
              );
            })}
            {matches.length > visibleMatches.length ? (
              <button
                className="context-agent-show-matches"
                onClick={() => setShowAllMatches(true)}
                type="button"
              >
                再显示 {matches.length - visibleMatches.length} 个可能匹配
              </button>
            ) : showAllMatches && matches.length > 3 ? (
              <button
                className="context-agent-show-matches"
                onClick={() => setShowAllMatches(false)}
                type="button"
              >
                收起匹配
              </button>
            ) : null}
            {duplicateMatches.length > 0 && onReviewDuplicates ? (
              <button
                className="context-agent-create-distinct"
                onClick={onReviewDuplicates}
                type="button"
              >
                审阅{duplicateMatches.length === 1 ? "可能重复项" : `${duplicateMatches.length} 个可能重复项`}
                <small>
                  打开可逆的合并预览；此联系人草稿不会直接合并任何内容。
                </small>
              </button>
            ) : null}
          </div>
        ) : (
          <p>
            没有现有人才匹配所提供的姓名或已确认身份线索，可以创建新身份。
          </p>
        )}
        {!committedSource &&
        lookupState === "ready" &&
        (exactMatches.length > 0 || expiredHandleMatches.length > 0) &&
        confirmedHandleMatches.length === 0 &&
        target.mode === "new_person" ? (
          <label className="context-agent-distinct-person">
            <input
              checked={differentPersonConfirmed}
              onChange={(event) => {
                setDifferentPersonConfirmed(event.target.checked);
                resetDraftRequests();
              }}
              type="checkbox"
            />
            <span>
              这与现有身份线索指向的不是同一个人
              <small>
                {expiredHandleMatches.length > 0
                  ? "这条线索曾有归属但已不再有效，因此必须确认。"
                  : "账号范围内已存在完全相同的姓名，因此必须确认。"}
              </small>
            </span>
          </label>
        ) : null}
        {lookupState === "ready" &&
        confirmedHandleMatches.length > 0 &&
        (Boolean(committedSource) || target.mode === "new_person") ? (
          <div
            className="context-agent-handle-owner"
            role="note"
          >
            <ShieldCheck aria-hidden="true" size={15} />
            <p>
              <strong>
                当前归属：{" "}
                {confirmedHandleMatches
                  .map((person) => person.display_label)
                  .join(", ")}
              </strong>
              <small>
                {committedSource
                  ? `人物已固定为 ${committedSource.scope.person.display_label}。请核对这条线索是否属于此人；不确定时请取消确认，直接打开已保存的人物。`
                  : "请选择当前人物、移除线索，或将此来源保留为未解决。历史归属者仍可用于对比，但不能接收此来源。"}
              </small>
            </p>
          </div>
        ) : null}
        {!committedSource &&
        lookupState === "ready" &&
        matches.length > 0 &&
        confirmedHandleMatches.length === 0 &&
        target.mode !== "new_person" ? (
          <button
            className="context-agent-create-distinct"
            onClick={() => {
              setTarget({ mode: "new_person" });
              setContextLabel("");
              setDifferentPersonConfirmed(false);
              resetDraftRequests();
            }}
            type="button"
          >
            改为创建另一个人
          </button>
        ) : null}
      </div>
      {parsedIdentityClue && maskedIdentityClue ? (
        <label className="context-agent-distinct-person">
          <input
            checked={identityClueConfirmed}
            disabled={
              !committedSource &&
              (lookupState !== "ready" || identityChoiceNeedsReview)
            }
            onChange={(event) => {
              setIdentityClueConfirmed(event.target.checked);
              handleRequestRef.current = null;
            }}
            type="checkbox"
          />
          <span>
            将 {maskedIdentityClue} 保存为已确认的
            {identityHandleLabel(parsedIdentityClue.type)}线索
            <small>
              {committedSource
                ? "身份已确定。这条线索只会附加到上面已保存的人物。"
                : identityChoiceNeedsReview
                  ? "确认这条线索前，请先选择身份。"
                  : "仅保存哈希、遮蔽提示、受治理来源和审阅期限，不保存原始值。邮箱、电话与微信线索每年复核。"}
            </small>
          </span>
        </label>
      ) : null}
      <details
        className="context-agent-create__details"
        onToggle={(event) => setSourceDetailsOpen(event.currentTarget.open)}
        open={sourceDetailsOpen}
      >
        <summary>关系与来源</summary>
        <label>
          <span>关系背景</span>
          <input
            autoComplete="off"
            disabled={
              Boolean(committedSource) ||
              target.mode === "existing_context"
            }
            maxLength={200}
            onChange={(event) => {
              setContextLabel(event.target.value);
              resetDraftRequests();
            }}
            placeholder="例如：产品副总裁寻访"
            value={contextLabel}
          />
        </label>
        <label>
          <span>首个来源</span>
          <textarea
            disabled={Boolean(committedSource)}
            maxLength={8_000}
            onChange={(event) => {
              setFirstNote(event.target.value);
              resetDraftRequests();
            }}
            placeholder="粘贴由你提供、可说明为何创建此关系的备注。"
            rows={3}
            value={firstNote}
          />
        </label>
      </details>
      <footer>
        <p>
          {committedSource
            ? "人物与首条来源已保存，不会重复写入；线索可修改、取消确认或放弃。"
            : target.mode === "existing_context"
              ? "这会将备注附到所选的现有关系。"
              : target.mode === "existing_person_new_context"
                ? "这会保留现有人物，仅创建独立的关系背景。"
                : "只有完成账号范围内的身份检查后，才会创建一个独立人物。"}{" "}
          它不会合并人物或联系任何人。
        </p>
        <div className="context-agent-create__footer-actions">
          {reviewReady && !committedSource ? (
            <button
              className="context-secondary-button"
              disabled={busy}
              onClick={() => void deferIdentityReview()}
              type="button"
            >
              保存待身份审阅
            </button>
          ) : null}
          {committedSource ? (
            <button
              className="context-secondary-button"
              disabled={busy}
              onClick={() => openSavedPerson()}
              type="button"
            >
              打开已保存的人物
            </button>
          ) : null}
          <button
            className="context-primary-button context-primary-button--compact"
            disabled={
              busy ||
              (committedSource
                ? !(
                    identityClue.trim().length === 0 ||
                    parsedIdentityClue !== null
                  )
                : !ready)
            }
            onClick={() => void commitPersonSource()}
            type="button"
          >
            {busy ? (
              <CircleNotch aria-hidden="true" className="spin" size={16} />
            ) : (
              <ArrowRight aria-hidden="true" size={16} />
            )}
            {busy
              ? "保存中"
              : committedSource
                ? identityClueConfirmed && parsedIdentityClue
                  ? "保存线索并完成"
                  : "完成并打开人物"
                : target.mode === "existing_context"
                  ? "附加来源"
                  : target.mode === "existing_person_new_context"
                    ? "添加关系"
                    : "创建新人物"}
          </button>
        </div>
      </footer>
    </section>
  );
}
