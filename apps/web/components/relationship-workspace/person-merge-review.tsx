"use client";

import type {
  KnowledgeSnapshot,
  PersonDirectoryItem,
  PersonMergePreview,
  PersonMergeResponse,
  PersonMergeReversalPreview,
  RelationshipScope,
} from "@talent-signal/contracts";
import {
  AddressBook,
  ArrowRight,
  CheckCircle,
  CircleNotch,
  Prohibit,
  UserPlus,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { relationshipIntegrationFetch } from "@/components/workspace-session-request";

export type PersonMergeWorkflowResponse = PersonMergeResponse & {
  compilations: Array<{
    relationship_context_id: string;
    person_id: string;
    status: KnowledgeSnapshot["status"] | "failed";
    knowledge_snapshot_id: string | null;
    error: string | null;
  }>;
};

function formatPersonMergeDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function personMergeDecisionReady({
  blockerCount,
  hasPreview,
  hasSelectedPerson,
  reason,
  reviewed,
}: {
  blockerCount: number;
  hasPreview: boolean;
  hasSelectedPerson: boolean;
  reason: string;
  reviewed: boolean;
}) {
  return (
    hasPreview &&
    hasSelectedPerson &&
    blockerCount === 0 &&
    reviewed &&
    reason.trim().length > 0
  );
}

export function availablePersonMergeReversalOperationId({
  result,
  reversalPreview,
}: {
  result: Pick<PersonMergeWorkflowResponse, "operation_id" | "status"> | null;
  reversalPreview: Pick<
    PersonMergeReversalPreview,
    "operation_id" | "reversal_available"
  > | null;
}) {
  if (result?.status === "applied") {
    return result.operation_id;
  }
  return reversalPreview?.reversal_available
    ? reversalPreview.operation_id
    : null;
}

export function PersonMergeReview({
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
    void relationshipIntegrationFetch("/api/local-integration/people", {
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
              : "无法加载用于重复项审阅的人才。",
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
            : "无法加载用于重复项审阅的人才。",
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
      const response = await relationshipIntegrationFetch(
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
            : "无法完成人才目录搜索。",
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
          : "无法完成人才目录搜索。",
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
    setBusy("正在比较依据");
    try {
      const parameters = new URLSearchParams({
        source_person_id: person.id,
        target_person_id: currentPerson.id,
      });
      const response = await relationshipIntegrationFetch(
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
            : "无法准备重复项审阅。",
        );
      }
      setPreview(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "无法准备重复项审阅。",
      );
    } finally {
      setBusy("");
    }
  }

  async function applyMerge() {
    if (
      !preview ||
      !selectedPerson ||
      !personMergeDecisionReady({
        blockerCount: preview.blockers.length,
        hasPreview: true,
        hasSelectedPerson: true,
        reason,
        reviewed,
      })
    ) {
      setError(
        "请审阅依据差异，并记录为何这些页面代表同一个人。",
      );
      return;
    }
    mergeRequestRef.current ??= crypto.randomUUID();
    setBusy("正在合并人物");
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
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
            : "未能完成人物合并。",
        );
      }
      setResult(payload);
      onMutation(payload, selectedPerson.display_label);
    } catch (caught) {
      mergeRequestRef.current = null;
      setError(
        caught instanceof Error
          ? caught.message
          : "未能完成人物合并。",
      );
    } finally {
      setBusy("");
    }
  }

  async function reverseMerge() {
    const operationId = availablePersonMergeReversalOperationId({
      result,
      reversalPreview,
    });
    if (
      !operationId ||
      !reversalReviewed ||
      !reversalReason.trim()
    ) {
      setError(
        "请确认关系拆分，并记录为何应撤销此次合并。",
      );
      return;
    }
    reversalRequestRef.current ??= crypto.randomUUID();
    setBusy("正在撤销合并");
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
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
            : "无法撤销人物合并。",
        );
      }
      setResult(payload);
      onMutation(
        payload,
        selectedPerson?.display_label ??
          preview?.source_person.display_label ??
          reversalPreview?.source_person.display_label ??
          "原人物",
      );
    } catch (caught) {
      reversalRequestRef.current = null;
      setError(
        caught instanceof Error
          ? caught.message
          : "无法撤销人物合并。",
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
          <strong>可能重复？</strong>
          <small>
            合并关系记忆前，请先比较身份依据。
          </small>
        </p>
        <button
          className="context-secondary-button"
          onClick={() => setOpen(true)}
          type="button"
        >
          审阅重复项
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
              ? "身份恢复"
              : "身份维护"}
          </p>
          <h2 id="person-merge-title">
            {reversalPreview
              ? "审阅此前的人物合并"
              : "审阅可能的重复项"}
          </h2>
          {reversalPreview ? (
            <p>
              将 {reversalPreview.source_person.display_label} 恢复为独立人物前，请重新检查当前关系状态。仅凭历史记录不能授权拆分。
            </p>
          ) : (
            <p>
              将 {currentPerson.display_label} 保留为稳定页面。只有经你确认后，所选页面、关系背景与受治理来源才会移到这里。
            </p>
          )}
        </div>
        <button
          aria-label="关闭重复项审阅"
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
              <span>当前保留页面</span>
              <strong>
                {reversalPreview.target_person.display_label}
              </strong>
              <small>当前人物与旧链接目标</small>
            </article>
            <ArrowRight aria-hidden="true" size={19} />
            <article>
              <span>单独恢复</span>
              <strong>
                {reversalPreview.source_person.display_label}
              </strong>
              <small>
                {reversalPreview.contexts_to_restore.length} 段关系背景
              </small>
            </article>
          </div>

          <div className="context-person-merge__inventory">
            <article>
              <span>待恢复的关系归属</span>
              <ul>
                {reversalPreview.contexts_to_restore.map((context) => (
                  <li key={context.id}>
                    <span>{context.display_label}</span>
                    <small>
                      {context.active_capture_count}{" "}
                      {context.active_capture_count === 1
                        ? "个来源"
                        : "个来源"}{" "}
                      · {context.active_fact_count} 项已确认事实
                    </small>
                  </li>
                ))}
              </ul>
            </article>
            <article>
              <span>招聘顾问的原始决定</span>
              <strong>
                合并于 {formatPersonMergeDate(reversalPreview.decided_at)}
              </strong>
              <p>{reversalPreview.original_reason}</p>
              <p>
                操作 {reversalPreview.operation_id.slice(0, 8)} · 当前状态 {reversalPreview.status}
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
                <strong>自动撤销已暂停</strong>
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
                为什么现在应将他们分开？
              </label>
              <textarea
                id="person-merge-history-reversal-reason"
                onChange={(event) => {
                  setReversalReason(event.target.value);
                  reversalRequestRef.current = null;
                }}
                placeholder="记录招聘顾问观察到的更正依据。"
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
                  我已审阅当前关系归属与原始合并依据。仅将 {reversalPreview.source_person.display_label} 恢复为此次操作所记录的独立人物。
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
                {busy === "正在撤销合并" ? (
                  <CircleNotch
                    aria-hidden="true"
                    className="context-spin"
                    size={17}
                  />
                ) : (
                  <Prohibit aria-hidden="true" size={17} />
                )}
                恢复独立页面
              </button>
              <small>
                执行时会重新检查规范状态，且不会进行外部写入。
              </small>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="context-person-merge__picker">
            <label htmlFor="person-merge-query">
              查找可能重复的页面
            </label>
            <input
              autoComplete="off"
              id="person-merge-query"
              onChange={(event) =>
                void searchPeople(event.target.value)
              }
              placeholder="姓名或关系背景"
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
                      {person.context_count} 段关系背景 · {person.capture_count} 个受治理来源
                    </small>
                  </p>
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              ))}
              {!busy && matchingPeople.length === 0 ? (
                <p>没有其他活跃人物页面匹配此搜索。</p>
              ) : null}
            </div>
          </div>

          {preview ? (
            <div className="context-person-merge__preview">
              <div className="context-person-merge__direction">
                <article>
                  <span>合并入</span>
                  <strong>{preview.source_person.display_label}</strong>
                  <small>
                    {preview.contexts_to_move.length} 段关系背景
                  </small>
                </article>
                <ArrowRight aria-hidden="true" size={19} />
                <article data-target="true">
                  <span>保留</span>
                  <strong>{preview.target_person.display_label}</strong>
                  <small>网址与人物身份保持稳定</small>
                </article>
              </div>

              <div className="context-person-merge__inventory">
                <article>
                  <span>正在移动的关系记忆</span>
                  <strong>
                    {preview.active_capture_count} 个受治理来源 · {preview.active_identity_handle_count} 条身份线索
                  </strong>
                  <ul>
                    {preview.contexts_to_move.map((context) => (
                      <li key={context.id}>
                        <span>{context.display_label}</span>
                        <small>
                          {context.active_capture_count}{" "}
                          {context.active_capture_count === 1
                            ? "个来源"
                            : "个来源"}{" "}
                          · {context.active_fact_count} 项已确认事实
                        </small>
                      </li>
                    ))}
                  </ul>
                </article>
                <article>
                  <span>待审阅差异</span>
                  {preview.review_items.length > 0 ? (
                    <ul>
                      {preview.review_items.map((item, index) => (
                        <li key={`${item.kind}:${index}`}>
                          <span>{item.title}</span>
                          <small>
                            {item.detail} · {item.evidence_ids.length} 条依据引用
                          </small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      未发现冲突的标签、背景事实或已确认身份线索。
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
                    <strong>合并已暂停</strong>
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
                    为什么这些页面代表同一个人？
                  </label>
                  <textarea
                    id="person-merge-reason"
                    onChange={(event) => {
                      setReason(event.target.value);
                      mergeRequestRef.current = null;
                    }}
                    placeholder="记录招聘顾问观察到的身份依据。"
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
                      我已审阅上述标签、关系背景、来源数量与身份差异。将 {currentPerson.display_label} 保留为稳定页面。
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
                    {busy === "正在合并人物" ? (
                      <CircleNotch
                        aria-hidden="true"
                        className="context-spin"
                        size={17}
                      />
                    ) : (
                      <UserPlus aria-hidden="true" size={17} />
                    )}
                    合并到 {currentPerson.display_label}
                  </button>
                  <small>
                    这只会更改内部身份与 Wiki 记忆，不会发送消息或执行外部写入。
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
                  ? "已保留一个持续更新的人物页面"
                  : "已恢复独立人物页面"}
              </strong>
              <small>
                操作 {result.operation_id.slice(0, 8)} · {result.affected_relationship_context_ids.length} 段背景 · {result.captures_rebound} 个受治理来源
              </small>
            </p>
          </div>
          <p>
            {result.compilations.length - compilationFailures.length} of{" "}
            {result.compilations.length} 个关系 Wiki 已成功重新编译。
            {compilationFailures.length > 0
              ? ` ${compilationFailures.length} 个需要安全重试；来源归属已保留。`
              : ""}
          </p>

          {result.status === "applied" && result.reversal_available ? (
            <details>
              <summary>撤销此次合并</summary>
              <p>
                撤销会恢复此前人物与关系归属。如果新依据已依赖移动过的背景，操作会停止。
              </p>
              <label htmlFor="person-merge-reversal-reason">
                为什么应将这些人分开？
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
                  我已审阅拆分，并理解此前的人物页面及其关系背景将被恢复。
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
                {busy === "正在撤销合并" ? (
                  <CircleNotch
                    aria-hidden="true"
                    className="context-spin"
                    size={17}
                  />
                ) : (
                  <Prohibit aria-hidden="true" size={17} />
                )}
                恢复独立页面
              </button>
            </details>
          ) : (
            <button
              className="context-secondary-button"
              onClick={closeReview}
              type="button"
            >
              完成
            </button>
          )}
        </div>
      )}

      {busy && busy !== "正在合并人物" && busy !== "正在撤销合并" ? (
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
