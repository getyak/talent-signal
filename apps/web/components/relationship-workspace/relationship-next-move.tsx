"use client";

import type {
  EffectReversalPreview,
  WorkspaceReviewResponse,
} from "@talent-signal/contracts";
import {
  ArrowRight,
  CheckCircle,
  Prohibit,
  ShieldCheck,
  Sparkle,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { relationshipIntegrationFetch } from "@/components/workspace-session-request";

export type RelationshipWorkspaceMutator = (
  path: string,
  options: RequestInit,
  label: string,
) => Promise<WorkspaceReviewResponse | null>;

type Props = {
  busy: boolean;
  mutate: RelationshipWorkspaceMutator;
  onAnnouncement: (message: string) => void;
  onBusyChange: (label: string) => void;
  onError: (message: string) => void;
  workspace: WorkspaceReviewResponse;
};

export function relationshipNextMoveDecision(
  workspace: WorkspaceReviewResponse,
) {
  const assertions = workspace.analysis.assertions;
  const action = workspace.analysis.action;
  const approval = workspace.latest_approval;
  const effect = workspace.latest_effect;
  const requiredFactsConfirmed =
    action !== null &&
    action.required_assertion_ids.every((id) =>
      assertions.some(
        (assertion) =>
          assertion.id === id && assertion.review_status === "confirmed",
      ),
    );
  const staleApprovalNeedsReview =
    action?.status === "proposed" &&
    approval?.status === "stale" &&
    effect === null;
  const canApproveCurrentAction =
    action?.status === "proposed" &&
    requiredFactsConfirmed &&
    effect === null &&
    (approval === null || approval.status === "stale");

  return {
    canApproveCurrentAction,
    requiredFactsConfirmed,
    staleApprovalNeedsReview,
  };
}

export function RelationshipNextMove({
  busy,
  mutate,
  onAnnouncement,
  onBusyChange,
  onError,
  workspace,
}: Props) {
  const [reversalPreview, setReversalPreview] =
    useState<EffectReversalPreview | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalReviewed, setReversalReviewed] = useState(false);
  const reversalApprovalRequestRef = useRef<string | null>(null);
  const action = workspace.analysis.action;
  const approval = workspace.latest_approval;
  const effect = workspace.latest_effect;
  const reversal = effect?.reversal;
  const reversalApproval = reversal?.latest_approval;
  const reversalAttempt = reversal?.latest_attempt;
  const sourceAuthorizationAvailable =
    workspace.source_authorization.state === "authorized";
  const {
    canApproveCurrentAction,
    requiredFactsConfirmed,
    staleApprovalNeedsReview,
  } = relationshipNextMoveDecision(workspace);

  async function reviewEffectReversal() {
    if (!effect) {
      return;
    }
    onBusyChange("正在审阅当前目标位置");
    onError("");
    onAnnouncement(
      "正在撤销审阅前读取当前目标位置。",
    );
    try {
      const response = await relationshipIntegrationFetch(
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
            : "无法核验撤销预览。",
        );
      }
      setReversalPreview(payload);
      setReversalReviewed(false);
      reversalApprovalRequestRef.current = null;
      onAnnouncement(
        payload.reversal_available
          ? "精确撤销预览已就绪，目标位置状态没有改变。"
          : "当前目标位置状态阻止了自动撤销。",
      );
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "无法核验撤销预览。",
      );
      onAnnouncement("撤销审阅失败，没有移除任何内容。");
    } finally {
      onBusyChange("");
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
          capture_id: workspace.capture.id,
          expected_destination_version:
            reversalPreview.expected_destination_version,
          expected_preview_digest: reversalPreview.preview_digest,
          reason: reversalReason.trim(),
          request_id:
            reversalApprovalRequestRef.current ??
            (reversalApprovalRequestRef.current = crypto.randomUUID()),
        }),
      },
      "正在批准精确撤销",
    );
    if (next) {
      reversalApprovalRequestRef.current = null;
      setReversalReviewed(false);
      onAnnouncement(
        "精确撤销已批准。在单独执行前，目标位置保持不变。",
      );
    }
  }

  return (
    <section className="context-next-move" id="next-move">
      <div className="context-next-move__heading">
        <span>
          <Sparkle aria-hidden="true" size={17} weight="fill" />
        </span>
        <div>
          <p className="eyebrow">下一步</p>
          <h2>有依据的最小步骤</h2>
        </div>
      </div>

      {action ? (
        <>
          <div className="context-next-move__body">
            <strong>{action.target}</strong>
            <p>{action.reason}</p>
            <dl>
              <div>
                <dt>负责人</dt>
                <dd>你</dd>
              </div>
              <div>
                <dt>截止时间</dt>
                <dd>{action.due}</dd>
              </div>
              <div>
                <dt>目标位置</dt>
                <dd>内部注意事项队列</dd>
              </div>
            </dl>
          </div>

          {!requiredFactsConfirmed ? (
            <div className="context-next-move__gate">
              <ShieldCheck aria-hidden="true" size={18} />
              <p>
                此内部行动获批前，请确认每项必需事实。
              </p>
            </div>
          ) : null}

          {staleApprovalNeedsReview ? (
            <div className="context-next-move__gate">
              <Warning aria-hidden="true" size={18} />
              <p>
                <strong>先前批准已过时。</strong>批准后，具体行动发生了变化。批准此版本前，请审阅当前目标与变更。
              </p>
            </div>
          ) : null}

          {canApproveCurrentAction ? (
            <button
              className="context-primary-button"
              disabled={busy}
              onClick={() =>
                void mutate(
                  `/api/local-integration/actions/${action.id}/approval`,
                  {
                    method: "POST",
                    body: JSON.stringify({ capture_id: workspace.capture.id }),
                  },
                  "正在批准精确内部行动",
                )
              }
              type="button"
            >
              <ShieldCheck aria-hidden="true" size={18} />
              {staleApprovalNeedsReview
                ? "批准修订后的内部行动"
                : "批准精确内部行动"}
            </button>
          ) : null}

          {approval?.status === "active" && !effect ? (
            <div className="context-approved-action">
              <p>
                <CheckCircle aria-hidden="true" size={18} weight="fill" />
                精确行动已批准
              </p>
              <button
                className="context-primary-button"
                disabled={busy}
                onClick={() =>
                  void mutate(
                    `/api/local-integration/actions/${action.id}/execution`,
                    {
                      method: "POST",
                      body: JSON.stringify({
                        capture_id: workspace.capture.id,
                      }),
                    },
                    "正在写入并核验内部注意事项",
                  )
                }
                type="button"
              >
                <ArrowRight aria-hidden="true" size={18} />
                添加到今日并核验
              </button>
            </div>
          ) : null}

          {effect?.outcome ? (
            <div
              className="context-outcome"
              data-state={effect.outcome.status}
            >
              {effect.outcome.status === "verified" ? (
                <CheckCircle aria-hidden="true" size={25} weight="fill" />
              ) : (
                <Warning aria-hidden="true" size={25} weight="fill" />
              )}
              <p>
                <strong>
                  {effect.outcome.status === "verified"
                    ? "已记录到今日"
                    : `结果状态：${effect.outcome.status}`}
                </strong>
                {effect.outcome.summary}
              </p>
              {effect.outcome.status === "unknown" ? (
                <button
                  className="context-secondary-button"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      `/api/local-integration/effects/${effect.attempt_id}/reconciliation`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          capture_id: workspace.capture.id,
                        }),
                      },
                      "正在重试前核对目标位置",
                    )
                  }
                  type="button"
                >
                  <ArrowRight aria-hidden="true" size={17} />
                  重试前核对
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
                  <p className="eyebrow">撤销</p>
                  <h3 id="effect-reversal-title">
                    安全移除本地效果
                  </h3>
                </div>
                <span>单独批准</span>
              </header>
              <p>
                撤销只会移除带标记的模拟今日事项。原始批准、执行、读取与撤销决定都会保留在历史中。
              </p>

              {reversalAttempt?.outcome?.status === "verified" ? (
                <div
                  className="context-effect-reversal__receipt"
                  role="status"
                >
                  <CheckCircle aria-hidden="true" size={23} weight="fill" />
                  <div>
                    <strong>已移除，并核验为不存在</strong>
                    <p>{reversalAttempt.outcome.summary}</p>
                    <small>
                      原始效果 {effect.attempt_id.slice(0, 8)} · 撤销{" "}
                      {reversalAttempt.reversal_attempt_id.slice(0, 8)}
                    </small>
                  </div>
                </div>
              ) : reversal?.status === "approved" &&
                reversalApproval?.status === "active" ? (
                <div className="context-effect-reversal__approved">
                  <dl>
                    <div>
                      <dt>精确事项</dt>
                      <dd>
                        {reversalApproval.exact_preview.current_effect.title}
                      </dd>
                    </div>
                    <div>
                      <dt>目标位置</dt>
                      <dd>{reversalApproval.exact_preview.target.label}</dd>
                    </div>
                    <div>
                      <dt>关联版本</dt>
                      <dd>
                        {
                          reversalApproval.exact_preview
                            .expected_destination_version
                        }
                      </dd>
                    </div>
                    <div>
                      <dt>原因</dt>
                      <dd>{reversalApproval.reason}</dd>
                    </div>
                  </dl>
                  <div className="context-effect-reversal__actions">
                    <button
                      className="context-primary-button"
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          `/api/local-integration/effects/${effect.attempt_id}/reversal/execution`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              approval_id: reversalApproval.id,
                              capture_id: workspace.capture.id,
                            }),
                          },
                          "正在撤销并核验目标位置读取结果",
                        )
                      }
                      type="button"
                    >
                      <Prohibit aria-hidden="true" size={17} />
                      移除事项并核验
                    </button>
                    <button
                      className="context-text-button"
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          `/api/local-integration/effect-reversal-approvals/${reversalApproval.id}/revocation`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              capture_id: workspace.capture.id,
                            }),
                          },
                          "正在撤销撤销批准",
                        )
                      }
                      type="button"
                    >
                      <X aria-hidden="true" size={16} />
                      撤回撤销批准
                    </button>
                  </div>
                  <small>
                    批准不会改变目标位置状态。移除仍需执行上方的独立行动，并得到匹配的“不存在”读取结果。
                  </small>
                </div>
              ) : (
                <>
                  {reversalAttempt?.outcome?.status === "failed" ? (
                    <div
                      className="context-effect-reversal__blocked"
                      role="alert"
                    >
                      <Warning aria-hidden="true" size={18} />
                      <p>
                        <strong>没有移除任何内容。</strong>{" "}
                        {reversalAttempt.outcome.summary} 请打开新的审阅后再作决定。
                      </p>
                    </div>
                  ) : null}

                  {!reversalPreview ? (
                    <button
                      className="context-secondary-button"
                      disabled={busy}
                      onClick={() => void reviewEffectReversal()}
                      type="button"
                    >
                      <ArrowRight aria-hidden="true" size={17} />
                      审阅撤销
                    </button>
                  ) : (
                    <div className="context-effect-reversal__preview">
                      <dl>
                        <div>
                          <dt>移除</dt>
                          <dd>{reversalPreview.reversal.title}</dd>
                        </div>
                        <div>
                          <dt>来自</dt>
                          <dd>{reversalPreview.target.label}</dd>
                        </div>
                        <div>
                          <dt>当前版本</dt>
                          <dd>{reversalPreview.expected_destination_version}</dd>
                        </div>
                        <div>
                          <dt>保留</dt>
                          <dd>原始效果与两份审计回执</dd>
                        </div>
                      </dl>

                      {reversalPreview.blockers.length > 0 ? (
                        <div
                          className="context-effect-reversal__blocked"
                          role="alert"
                        >
                          <Warning aria-hidden="true" size={18} />
                          <div>
                            <strong>自动撤销已暂停</strong>
                            {reversalPreview.blockers.map((blocker) => (
                              <p key={blocker.code}>{blocker.message}</p>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="context-effect-reversal__decision">
                          <label htmlFor="effect-reversal-reason">
                            为什么应该移除此事项？
                          </label>
                          <textarea
                            id="effect-reversal-reason"
                            onChange={(event) => {
                              setReversalReason(event.target.value);
                              reversalApprovalRequestRef.current = null;
                            }}
                            placeholder="记录招聘顾问观察到的原因。"
                            rows={3}
                            value={reversalReason}
                          />
                          <label>
                            <input
                              checked={reversalReviewed}
                              onChange={(event) =>
                                setReversalReviewed(event.target.checked)
                              }
                              type="checkbox"
                            />
                            <span>
                              我已审阅精确事项、目标位置、当前版本与保留的审计历史。
                            </span>
                          </label>
                          <div className="context-effect-reversal__actions">
                            <button
                              className="context-primary-button"
                              disabled={
                                busy ||
                                !reversalReviewed ||
                                !reversalReason.trim()
                              }
                              onClick={() =>
                                void approveCurrentEffectReversal()
                              }
                              type="button"
                            >
                              <ShieldCheck aria-hidden="true" size={17} />
                              批准精确撤销
                            </button>
                            <button
                              className="context-text-button"
                              disabled={busy}
                              onClick={() => {
                                setReversalPreview(null);
                                setReversalReviewed(false);
                                reversalApprovalRequestRef.current = null;
                              }}
                              type="button"
                            >
                              保留事项
                            </button>
                          </div>
                          <small>
                            此批准不会授予其他行动权限，也不会立即移除事项。
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
            <strong>当前没有行动权限。</strong>请恢复或续期来源，再审阅每项返回提案，然后再考虑新行动。
          </p>
        </div>
      ) : (
        <div className="context-next-move__empty">
          <CheckCircle aria-hidden="true" size={23} />
          <p>
            <strong>尚无证据支持行动。</strong>请保留背景，或在出现操作性变化时采集下一段对话。
          </p>
        </div>
      )}
    </section>
  );
}
