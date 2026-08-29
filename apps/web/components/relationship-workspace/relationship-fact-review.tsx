"use client";

import type { WorkspaceReviewResponse } from "@talent-signal/contracts";
import {
  Check,
  CheckCircle,
  PencilSimple,
  Quotes,
  Warning,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { fieldLabel, reviewLabel } from "./relationship-display";
import type { RelationshipWorkspaceMutator } from "./relationship-next-move";

export function isCompleteCalendarDate(value: string) {
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

export function requiresFactSupersession({
  currentValue,
  pending,
  proposedValue,
  temporalRelation,
}: {
  currentValue: string | null;
  pending: boolean;
  proposedValue: string;
  temporalRelation: string | null;
}) {
  return Boolean(
    pending &&
      currentValue !== null &&
      currentValue !== proposedValue &&
      temporalRelation !== "supersedes",
  );
}

export function RelationshipFactReview({
  busy,
  mutate,
  workspace,
}: {
  busy: boolean;
  mutate: RelationshipWorkspaceMutator;
  workspace: WorkspaceReviewResponse;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const assertions = workspace.analysis.assertions;
  const reviewedCount = assertions.filter((assertion) =>
    ["confirmed", "dismissed", "unresolved"].includes(
      assertion.review_status,
    ),
  ).length;
  const activeConfirmedStates = workspace.confirmed_state.assertions.filter(
    (state) => state.state_status === "active",
  );
  const sourceAuthorizationAvailable =
    workspace.source_authorization.state === "authorized";
  const evidenceById = useMemo(
    () =>
      new Map(
        workspace.capture.messages.map((message) => [message.id, message]),
      ),
    [workspace.capture.messages],
  );

  async function decide(
    assertionId: string,
    version: number,
    decision: "confirm" | "dismiss" | "leave_unresolved",
    correctedValue?: string,
  ) {
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
      "正在保存事实决定",
    );
    if (next) {
      setEditing(null);
    }
  }

  return (
    <section
      aria-labelledby="changed-title"
      className="context-section context-changed"
      id="proposed-changes"
      tabIndex={-1}
    >
      <div className="context-section__heading">
        <div>
          <p className="eyebrow">发生了什么变化</p>
          <h2 id="changed-title">等待你判断的证据</h2>
        </div>
        <span>
          已审阅 {reviewedCount}/{assertions.length}
        </span>
      </div>

      {assertions.length > 0 ? (
        <div className="context-facts">
          {assertions.map((assertion) => {
            const evidence = evidenceById.get(assertion.evidence_id);
            const isEditing = editing === assertion.id;
            const edited = edits[assertion.id] ?? assertion.value ?? "";
            const pending = assertion.review_status === "pending";
            const ambiguous = pending && assertion.status === "ambiguous";
            const needsCalendarDate =
              ambiguous && assertion.field === "decision_deadline";
            const currentFieldState = activeConfirmedStates.find(
              (state) => state.field === assertion.field,
            );
            const valueUnderReview = isEditing
              ? edited.trim()
              : assertion.value?.trim() ?? "";
            const requiresSupersession = requiresFactSupersession({
              currentValue: currentFieldState?.value ?? null,
              pending,
              proposedValue: valueUnderReview,
              temporalRelation: assertion.temporal_relation,
            });
            const editedValueIsValid =
              edited.trim().length > 0 &&
              (!needsCalendarDate || isCompleteCalendarDate(edited));

            return (
              <article data-state={assertion.review_status} key={assertion.id}>
                <div className="context-fact__main">
                  <div className="context-fact__label">
                    <span>{fieldLabel(assertion.field)}</span>
                    <i>
                      {ambiguous
                        ? "需要澄清"
                        : reviewLabel(assertion.review_status)}
                    </i>
                  </div>
                  {isEditing ? (
                    <label className="context-fact__edit">
                      <span className="sr-only">修正后的值</span>
                      <input
                        autoFocus
                        maxLength={2_000}
                        onChange={(event) =>
                          setEdits((current) => ({
                            ...current,
                            [assertion.id]: event.target.value,
                          }))
                        }
                        placeholder={needsCalendarDate ? "YYYY-MM-DD" : undefined}
                        value={edited}
                      />
                      {needsCalendarDate ? (
                        <small>
                          请添加完整日历日期。截图没有为“{assertion.value}”提供已核验时间戳。
                        </small>
                      ) : null}
                    </label>
                  ) : (
                    <p className="context-fact__value">{assertion.value}</p>
                  )}
                  <a
                    className="context-fact__evidence"
                    href={`#source-${assertion.evidence_id}`}
                  >
                    <Quotes aria-hidden="true" size={16} weight="fill" />
                    <span>
                      “{assertion.evidence_quote}”
                      {evidence ? ` · ${evidence.source_message_id}` : ""}
                    </span>
                  </a>
                  {ambiguous && !isEditing ? (
                    <p className="context-fact__ambiguity">
                      这项提取值缺少足够明确的锚点，不能按原样记住。请修正、保持未解决或驳回。
                    </p>
                  ) : null}
                  {requiresSupersession ? (
                    <div className="context-fact__ambiguity" role="status">
                      <strong>当前值保持不变</strong>
                      <span>
                        {currentFieldState?.value} → {valueUnderReview}
                      </span>
                      <small>
                        替换它需要一项独立且关联来源的取代提案。如果该提案不可用，请保持未解决或驳回。
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
                            busy || !editedValueIsValid || requiresSupersession
                          }
                          onClick={() =>
                            void decide(
                              assertion.id,
                              assertion.version,
                              "confirm",
                              edited,
                            )
                          }
                          type="button"
                        >
                          <Check aria-hidden="true" size={16} />
                          保存并确认
                        </button>
                        <button
                          className="context-text-button"
                          onClick={() => setEditing(null)}
                          type="button"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        {ambiguous ? (
                          <button
                            className="context-primary-button context-primary-button--compact"
                            disabled={busy}
                            onClick={() => {
                              setEditing(assertion.id);
                              setEdits((current) => ({
                                ...current,
                                [assertion.id]: "",
                              }));
                            }}
                            type="button"
                          >
                            <PencilSimple aria-hidden="true" size={16} />
                            {needsCalendarDate ? "添加完整日期" : "解决"}
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
                                需要取代提案
                              </button>
                            ) : (
                              <button
                                className="context-primary-button context-primary-button--compact"
                                disabled={busy}
                                onClick={() =>
                                  void decide(
                                    assertion.id,
                                    assertion.version,
                                    "confirm",
                                  )
                                }
                                type="button"
                              >
                                <Check aria-hidden="true" size={16} />
                                确认
                              </button>
                            )}
                            <button
                              aria-label={`编辑${fieldLabel(assertion.field)}`}
                              className="context-icon-button"
                              onClick={() => {
                                setEditing(assertion.id);
                                setEdits((current) => ({
                                  ...current,
                                  [assertion.id]: assertion.value ?? "",
                                }));
                              }}
                              type="button"
                            >
                              <PencilSimple aria-hidden="true" size={17} />
                            </button>
                          </>
                        )}
                        <button
                          className="context-text-button"
                          disabled={busy}
                          onClick={() =>
                            void decide(
                              assertion.id,
                              assertion.version,
                              "leave_unresolved",
                            )
                          }
                          type="button"
                        >
                          不确定
                        </button>
                        <button
                          className="context-text-button"
                          disabled={busy}
                          onClick={() =>
                            void decide(
                              assertion.id,
                              assertion.version,
                              "dismiss",
                            )
                          }
                          type="button"
                        >
                          驳回
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
            <strong>来源访问不可用。</strong>请从“来源”中恢复或续期该受治理来源。先前结论与行动不会自动恢复；证据会重新进入审阅。
          </p>
        </div>
      ) : (
        <div className="context-no-signal context-no-signal--page">
          <CheckCircle aria-hidden="true" size={25} />
          <p>
            <strong>没有提出操作性变更。</strong>来源仍可作为背景，但不足以支持一项事实或下一步。
          </p>
        </div>
      )}
    </section>
  );
}
