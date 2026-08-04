"use client";

import type { WorkspaceReviewResponse } from "@talent-signal/contracts";
import {
  ArrowClockwise,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  Database,
  LinkSimple,
  PencilSimple,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ThemeToggle } from "./theme-toggle";

type Props = {
  initialWorkspace: WorkspaceReviewResponse | null;
  initialError: string | null;
  user: {
    email?: string | null;
    name?: string | null;
  };
};

type MutationState = {
  label: string;
  target: string;
} | null;

function reviewLabel(status: string) {
  switch (status) {
    case "confirmed":
      return "Confirmed by recruiter";
    case "dismissed":
      return "Dismissed";
    case "unresolved":
      return "Needs clarification";
    default:
      return "Proposed from evidence";
  }
}

function fieldLabel(field: string) {
  return field.replaceAll("_", " ");
}

export function IntegratedWorkspaceApp({
  initialWorkspace,
  initialError,
  user,
}: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [error, setError] = useState(initialError);
  const [mutation, setMutation] = useState<MutationState>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  const assertions = workspace?.analysis.assertions ?? [];
  const allFactsReviewed =
    assertions.length > 0 &&
    assertions.every((assertion) =>
      ["confirmed", "dismissed"].includes(assertion.review_status),
    );
  const confirmedCount = assertions.filter(
    (assertion) => assertion.review_status === "confirmed",
  ).length;
  const verified =
    workspace?.latest_effect?.attempt_status === "verified" &&
    workspace.latest_effect.observation?.match_status === "matched" &&
    workspace.latest_effect.outcome?.status === "verified";
  const action = workspace?.analysis.action ?? null;
  const approval = workspace?.latest_approval ?? null;

  const evidenceById = useMemo(
    () =>
      new Map(
        (workspace?.capture.messages ?? []).map((message) => [
          message.id,
          message,
        ]),
      ),
    [workspace],
  );

  async function requestWorkspace(
    path: string,
    options?: RequestInit,
    label = "Refreshing canonical state",
    target = "workspace",
  ) {
    setMutation({ label, target });
    setError(null);
    try {
      const response = await fetch(path, {
        cache: "no-store",
        ...options,
        headers: {
          ...(options?.body ? { "content-type": "application/json" } : {}),
          ...options?.headers,
        },
      });
      const payload = (await response.json()) as
        | WorkspaceReviewResponse
        | { code?: string; message?: string; workspace?: WorkspaceReviewResponse };
      if (!response.ok) {
        const failure = payload as { code?: string; message?: string };
        throw new Error(
          failure.message ??
            `The localhost backend returned ${failure.code ?? response.status}.`,
        );
      }
      const next =
        "workspace" in payload && payload.workspace
          ? payload.workspace
          : (payload as WorkspaceReviewResponse);
      setWorkspace(next);
      return next;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The localhost state could not be refreshed.",
      );
      return null;
    } finally {
      setMutation(null);
    }
  }

  async function decide(
    assertionId: string,
    version: number,
    decision: "confirm" | "dismiss",
    correctedValue?: string,
  ) {
    const next = await requestWorkspace(
      `/api/local-integration/assertions/${assertionId}/decisions`,
      {
        method: "POST",
        body: JSON.stringify({
          decision,
          expected_assertion_version: version,
          ...(correctedValue ? { corrected_value: correctedValue } : {}),
        }),
      },
      decision === "dismiss"
        ? "Recording the dismissal"
        : correctedValue
          ? "Saving the edit and confirmation"
          : "Recording the fact confirmation",
      assertionId,
    );
    if (next) {
      setEditing(null);
    }
  }

  return (
    <main className="integration-shell">
      <header className="integration-topbar">
        <Link className="integration-brand" href="/" aria-label="Talent Signal home">
          <span aria-hidden="true">TS</span>
          <strong>Talent Signal</strong>
        </Link>
        <div className="integration-mode" role="status">
          <ShieldCheck size={18} weight="duotone" aria-hidden="true" />
          Local simulation · synthetic fixture only
        </div>
        <div className="integration-user">
          <div>
            <span>{user.name ?? "Simulated recruiter"}</span>
            <small>{user.email ?? "local account"}</small>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="integration-layout">
        <aside className="integration-rail" aria-label="Journey status">
          <p className="eyebrow">TS-CORE-01 · LOCALHOST</p>
          <h1>One source. One governed decision.</h1>
          <p>
            Review the exact browser capture, decide each proposed fact, then
            authorize one deterministic local effect separately.
          </p>

          <ol className="integration-steps">
            <li data-complete={Boolean(workspace)}>
              <span>1</span>
              <div>
                <strong>Capture received</strong>
                <small>Chrome submit → backend receipt</small>
              </div>
            </li>
            <li data-complete={allFactsReviewed}>
              <span>2</span>
              <div>
                <strong>Facts reviewed</strong>
                <small>{confirmedCount} confirmed · no effect authority</small>
              </div>
            </li>
            <li data-complete={Boolean(approval)}>
              <span>3</span>
              <div>
                <strong>Effect approved</strong>
                <small>Exact target and version bound</small>
              </div>
            </li>
            <li data-complete={verified}>
              <span>4</span>
              <div>
                <strong>Readback verified</strong>
                <small>Destination observation matches</small>
              </div>
            </li>
          </ol>

          <div className="integration-provenance">
            <Database size={19} weight="duotone" aria-hidden="true" />
            <div>
              <strong>Backend is canonical</strong>
              <small>
                {workspace
                  ? `${workspace.account_slug} · cursor ${workspace.audit_cursor}`
                  : "Waiting for an account-scoped capture"}
              </small>
            </div>
          </div>
        </aside>

        <section className="integration-work">
          <div className="integration-work__header">
            <div>
              <p className="eyebrow">EVIDENCE REVIEW</p>
              <h2>{workspace?.subject.display_label ?? "Awaiting Chrome capture"}</h2>
              <p>
                {workspace?.assignment.display_label ??
                  "Select the frozen sentence on the local capture page, review it in the extension, and press Submit."}
              </p>
            </div>
            <button
              className="quiet-button"
              type="button"
              onClick={() =>
                requestWorkspace(
                  "/api/local-integration/workspace",
                  undefined,
                  "Reading the latest backend state",
                )
              }
              disabled={Boolean(mutation)}
            >
              {mutation?.target === "workspace" ? (
                <CircleNotch className="spin" size={18} aria-hidden="true" />
              ) : (
                <ArrowClockwise size={18} aria-hidden="true" />
              )}
              Refresh
            </button>
          </div>

          {error ? (
            <div className="integration-alert" role="alert">
              <strong>Canonical state is not available yet.</strong>
              <p>{error}</p>
            </div>
          ) : null}

          {!workspace ? (
            <div className="integration-empty">
              <LinkSimple size={30} weight="duotone" aria-hidden="true" />
              <h3>No submitted evidence</h3>
              <p>
                Nothing is inferred or persisted until the reviewed browser
                payload is explicitly submitted.
              </p>
            </div>
          ) : (
            <>
              <section className="integration-source" aria-labelledby="source-title">
                <div className="integration-section-heading">
                  <div>
                    <p className="eyebrow">OBSERVED SOURCE</p>
                    <h3 id="source-title">Exact captured evidence</h3>
                  </div>
                  <span>receipt {workspace.capture.id.slice(0, 8)}</span>
                </div>
                {workspace.capture.messages.map((message) => (
                  <figure key={message.id}>
                    <blockquote>“{message.text}”</blockquote>
                    <figcaption>
                      {message.source_message_id} · {message.speaker} ·{" "}
                      {workspace.capture.source.source_timezone}
                    </figcaption>
                  </figure>
                ))}
                <dl className="integration-source-meta">
                  <div>
                    <dt>Suite</dt>
                    <dd>candidate-momentum-v1 · 2026-08-05.1</dd>
                  </div>
                  <div>
                    <dt>Classification</dt>
                    <dd>{workspace.data_classification}</dd>
                  </div>
                  <div>
                    <dt>Capture</dt>
                    <dd>{workspace.capture.source.kind} · explicit submit</dd>
                  </div>
                </dl>
              </section>

              <section aria-labelledby="facts-title">
                <div className="integration-section-heading">
                  <div>
                    <p className="eyebrow">PROPOSED → CONFIRMED</p>
                    <h3 id="facts-title">What changed</h3>
                  </div>
                  <span>{confirmedCount} of {assertions.length} confirmed</span>
                </div>

                <div className="integration-facts">
                  {assertions.map((assertion) => {
                    const evidence = evidenceById.get(assertion.evidence_id);
                    const isEditing = editing === assertion.id;
                    const editedValue =
                      editedValues[assertion.id] ?? assertion.value ?? "";
                    const busy = mutation?.target === assertion.id;
                    return (
                      <article
                        className="integration-fact"
                        data-state={assertion.review_status}
                        key={assertion.id}
                      >
                        <div className="integration-fact__heading">
                          <div>
                            <span>{reviewLabel(assertion.review_status)}</span>
                            <h4>{fieldLabel(assertion.field)}</h4>
                          </div>
                          {assertion.review_status === "confirmed" ? (
                            <CheckCircle
                              size={22}
                              weight="fill"
                              aria-label="Confirmed"
                            />
                          ) : null}
                        </div>

                        {isEditing ? (
                          <label className="integration-edit">
                            Corrected value
                            <input
                              autoFocus
                              value={editedValue}
                              onChange={(event) =>
                                setEditedValues((current) => ({
                                  ...current,
                                  [assertion.id]: event.target.value,
                                }))
                              }
                            />
                          </label>
                        ) : (
                          <p className="integration-fact__value">
                            {assertion.value}
                          </p>
                        )}

                        <div className="integration-evidence">
                          <LinkSimple size={16} aria-hidden="true" />
                          <span>
                            “{assertion.evidence_quote}” ·{" "}
                            {evidence?.source_message_id ?? "source"}
                          </span>
                        </div>

                        {assertion.review_status === "pending" ? (
                          <div className="integration-fact__actions">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    decide(
                                      assertion.id,
                                      assertion.version,
                                      "confirm",
                                      editedValue,
                                    )
                                  }
                                  disabled={busy || editedValue.trim().length === 0}
                                >
                                  {busy ? (
                                    <CircleNotch
                                      className="spin"
                                      size={17}
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Check size={17} aria-hidden="true" />
                                  )}
                                  Save and confirm
                                </button>
                                <button
                                  className="quiet-button"
                                  type="button"
                                  onClick={() => setEditing(null)}
                                  disabled={busy}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    decide(
                                      assertion.id,
                                      assertion.version,
                                      "confirm",
                                    )
                                  }
                                  disabled={busy}
                                >
                                  {busy ? (
                                    <CircleNotch
                                      className="spin"
                                      size={17}
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Check size={17} aria-hidden="true" />
                                  )}
                                  Confirm
                                </button>
                                <button
                                  className="quiet-button"
                                  type="button"
                                  onClick={() => setEditing(assertion.id)}
                                  disabled={busy}
                                >
                                  <PencilSimple size={17} aria-hidden="true" />
                                  Edit
                                </button>
                                <button
                                  className="quiet-button"
                                  type="button"
                                  onClick={() =>
                                    decide(
                                      assertion.id,
                                      assertion.version,
                                      "dismiss",
                                    )
                                  }
                                  disabled={busy}
                                >
                                  <X size={17} aria-hidden="true" />
                                  Dismiss
                                </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>

              {action ? (
                <section
                  className="integration-action"
                  aria-labelledby="action-title"
                >
                  <div className="integration-section-heading">
                    <div>
                      <p className="eyebrow">SEPARATE AUTHORITY</p>
                      <h3 id="action-title">One smallest next step</h3>
                    </div>
                    <span>local deterministic effect</span>
                  </div>

                  <div className="integration-action__body">
                    <div>
                      <h4>{action.target}</h4>
                      <p>{action.reason}</p>
                      <dl>
                        <div>
                          <dt>Owner</dt>
                          <dd>Recruiter</dd>
                        </div>
                        <div>
                          <dt>Due</dt>
                          <dd>{action.due}</dd>
                        </div>
                        <div>
                          <dt>Exact effect</dt>
                          <dd>{action.exact_preview.change.title}</dd>
                        </div>
                        <div>
                          <dt>Destination</dt>
                          <dd>{action.exact_preview.target.label}</dd>
                        </div>
                      </dl>
                    </div>

                    <div className="integration-authority">
                      {!allFactsReviewed ? (
                        <div className="authority-note">
                          <Clock size={20} weight="duotone" aria-hidden="true" />
                          <p>
                            Review every fact first. Confirming facts creates
                            zero effects and does not approve this proposal.
                          </p>
                        </div>
                      ) : !approval ? (
                        <>
                          <p>
                            This approval is bound to proposal version{" "}
                            {action.version} and the exact preview above.
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              requestWorkspace(
                                `/api/local-integration/actions/${action.id}/approval`,
                                { method: "POST" },
                                "Recording the exact action approval",
                                action.id,
                              )
                            }
                            disabled={mutation?.target === action.id}
                          >
                            {mutation?.target === action.id ? (
                              <CircleNotch
                                className="spin"
                                size={18}
                                aria-hidden="true"
                              />
                            ) : (
                              <ShieldCheck size={18} aria-hidden="true" />
                            )}
                            Approve exact local effect
                          </button>
                        </>
                      ) : !verified ? (
                        <>
                          <div className="authority-note" data-state="approved">
                            <ShieldCheck
                              size={21}
                              weight="duotone"
                              aria-hidden="true"
                            />
                            <p>
                              Approved · version {approval.action_version}. No
                              destination result has been claimed yet.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              requestWorkspace(
                                `/api/local-integration/actions/${action.id}/execution`,
                                { method: "POST" },
                                "Executing and reading back the local effect",
                                action.id,
                              )
                            }
                            disabled={mutation?.target === action.id}
                          >
                            {mutation?.target === action.id ? (
                              <CircleNotch
                                className="spin"
                                size={18}
                                aria-hidden="true"
                              />
                            ) : (
                              <Database size={18} aria-hidden="true" />
                            )}
                            Execute and verify readback
                          </button>
                        </>
                      ) : (
                        <div className="verified-result" role="status">
                          <CheckCircle
                            size={28}
                            weight="fill"
                            aria-hidden="true"
                          />
                          <div>
                            <strong>Verified after destination readback</strong>
                            <p>
                              {workspace.latest_effect?.observation?.destination_key}
                              {" · version "}
                              {workspace.latest_effect?.observation
                                ?.destination_version}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
