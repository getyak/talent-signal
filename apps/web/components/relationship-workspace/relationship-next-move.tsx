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
    onBusyChange("Reviewing current destination");
    onError("");
    onAnnouncement(
      "Reading the current destination before reversal review.",
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
            : "The reversal preview could not be verified.",
        );
      }
      setReversalPreview(payload);
      setReversalReviewed(false);
      reversalApprovalRequestRef.current = null;
      onAnnouncement(
        payload.reversal_available
          ? "Exact reversal preview ready. No destination state changed."
          : "Automatic reversal is blocked by current destination state.",
      );
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "The reversal preview could not be verified.",
      );
      onAnnouncement("Reversal review failed. Nothing was removed.");
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
      "Approving the exact reversal",
    );
    if (next) {
      reversalApprovalRequestRef.current = null;
      setReversalReviewed(false);
      onAnnouncement(
        "Exact reversal approved. The destination is unchanged until separate execution.",
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
                Confirm every required fact before this internal action can be
                approved.
              </p>
            </div>
          ) : null}

          {staleApprovalNeedsReview ? (
            <div className="context-next-move__gate">
              <Warning aria-hidden="true" size={18} />
              <p>
                <strong>Prior approval is stale.</strong> The exact action
                changed after approval. Review the current target and change
                before approving this version.
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
                <CheckCircle aria-hidden="true" size={18} weight="fill" />
                Exact action approved
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
                <CheckCircle aria-hidden="true" size={25} weight="fill" />
              ) : (
                <Warning aria-hidden="true" size={25} weight="fill" />
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
                Reversal removes only the labeled simulated Today item. The
                original approval, execution, readback, and reversal decision
                stay in history.
              </p>

              {reversalAttempt?.outcome?.status === "verified" ? (
                <div
                  className="context-effect-reversal__receipt"
                  role="status"
                >
                  <CheckCircle aria-hidden="true" size={23} weight="fill" />
                  <div>
                    <strong>Removed and verified absent</strong>
                    <p>{reversalAttempt.outcome.summary}</p>
                    <small>
                      Original effect {effect.attempt_id.slice(0, 8)} · reversal{" "}
                      {reversalAttempt.reversal_attempt_id.slice(0, 8)}
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
                        {reversalApproval.exact_preview.current_effect.title}
                      </dd>
                    </div>
                    <div>
                      <dt>Destination</dt>
                      <dd>{reversalApproval.exact_preview.target.label}</dd>
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
                    Approval changes no destination state. The removal still
                    requires the separate action above and a matching absence
                    readback.
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
                        <strong>Nothing was removed.</strong>{" "}
                        {reversalAttempt.outcome.summary} Open a fresh review
                        before deciding again.
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
                      Review reversal
                    </button>
                  ) : (
                    <div className="context-effect-reversal__preview">
                      <dl>
                        <div>
                          <dt>Remove</dt>
                          <dd>{reversalPreview.reversal.title}</dd>
                        </div>
                        <div>
                          <dt>From</dt>
                          <dd>{reversalPreview.target.label}</dd>
                        </div>
                        <div>
                          <dt>Current version</dt>
                          <dd>{reversalPreview.expected_destination_version}</dd>
                        </div>
                        <div>
                          <dt>Preserve</dt>
                          <dd>Original effect and both audit receipts</dd>
                        </div>
                      </dl>

                      {reversalPreview.blockers.length > 0 ? (
                        <div
                          className="context-effect-reversal__blocked"
                          role="alert"
                        >
                          <Warning aria-hidden="true" size={18} />
                          <div>
                            <strong>Automatic reversal paused</strong>
                            {reversalPreview.blockers.map((blocker) => (
                              <p key={blocker.code}>{blocker.message}</p>
                            ))}
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
                              setReversalReason(event.target.value);
                              reversalApprovalRequestRef.current = null;
                            }}
                            placeholder="Record the recruiter-observed reason."
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
                              I reviewed the exact item, destination, current
                              version, and preserved audit history.
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
                              Approve exact reversal
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
                              Keep item
                            </button>
                          </div>
                          <small>
                            This approval grants no other action and does not
                            remove the item yet.
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
            <strong>No action authority is available.</strong> Restore or renew
            the source, then review every returned proposal before considering
            a new action.
          </p>
        </div>
      ) : (
        <div className="context-next-move__empty">
          <CheckCircle aria-hidden="true" size={23} />
          <p>
            <strong>No action is supported yet.</strong> Keep the context, or
            capture the next conversation when something operational changes.
          </p>
        </div>
      )}
    </section>
  );
}
