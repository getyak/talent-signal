"use client";

import {
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  Path,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  TODAY_FOCUSED_ITEM_LIMIT,
  type PursuitTodayItem,
  type PursuitTodayProjection,
} from "@/lib/pursuitToday";
import { useWorkspaceSessionRecovery } from "./use-workspace-session-recovery";
import {
  workspaceSessionExpired,
  workspaceSessionFetch,
} from "./workspace-session-request";
import styles from "./pursuit-today-page.module.css";

type Props = {
  error: string | null;
  expanded: boolean;
  projection: PursuitTodayProjection | null;
  providerMode: "live_remote" | "safe_deterministic";
  sessionRecoveryHref: string | null;
};

type AgentResult = {
  status: string;
  proposalId: string | null;
  reason: string;
  externalEffectCount: number;
};

const evidenceCopy = {
  available: "Evidence available",
  partial: "Evidence partly available",
  unavailable: "Evidence unavailable",
  not_required: "Recruiter-authored",
} as const;

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function formatDue(value: string | null): string {
  if (!value) return "No due time";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        timeZone: "UTC",
      }).format(date);
}

function kindCopy(item: PursuitTodayItem): string {
  if (item.attentionKind === "review") {
    return item.proposalStatus === "needs_review"
      ? "Decision ready"
      : "Review recovery";
  }
  if (item.attentionKind === "action") return "Owned action";
  return "Open dependency";
}

function pursuitHref(item: PursuitTodayItem): string {
  const room = `/workspace/pursuits/${item.pursuitId}`;
  return item.attentionKind === "review" &&
    item.proposalStatus === "needs_review"
    ? `${room}#proposal`
    : room;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function AgentComposer({
  item,
  providerMode,
  sessionRecoveryHref,
}: {
  item: PursuitTodayItem;
  providerMode: Props["providerMode"];
  sessionRecoveryHref: string | null;
}) {
  const router = useRouter();
  const defaultObjective = useMemo(
    () =>
      `Review only the authorized evidence for “${item.title}”. Stage one smallest evidence-supported Pursuit update, or record no_action when nothing safe changed.`,
    [item.title],
  );
  const [objective, setObjective] = useState(defaultObjective);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);

  async function runAgent() {
    if (
      !item.agentContext ||
      submitting ||
      sessionRecoveryHref ||
      !objective.trim()
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await workspaceSessionFetch("/api/pursuit-agent-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pursuit_id: item.pursuitId,
          idempotency_key: crypto.randomUUID(),
          capture_id: item.agentContext.captureId,
          base_revision: item.revision,
          objective: objective.trim(),
          evidence_refs: item.agentContext.evidenceRefs,
        }),
      });
      const payload = (await response.json()) as {
        run?: {
          status: string;
          terminal_receipt: {
            proposal_id: string | null;
            reason_code: string;
            external_effects: unknown[];
          } | null;
        };
        error?: { message?: string };
      };
      if (workspaceSessionExpired(response.status, payload)) return;
      if (!response.ok || !payload.run?.terminal_receipt) {
        throw new Error(
          payload.error?.message ??
            "The Agent result could not be verified. Nothing changed.",
        );
      }
      setResult({
        status: payload.run.status,
        proposalId: payload.run.terminal_receipt.proposal_id,
        reason: payload.run.terminal_receipt.reason_code,
        externalEffectCount:
          payload.run.terminal_receipt.external_effects.length,
      });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Agent could not finish. Nothing changed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const disabledReason =
    item.evidenceState === "unavailable"
      ? "Source authority is unavailable, so a new run cannot cite it."
      : "No reviewed, authorized capture is attached to this Pursuit yet.";
  const successfulResult =
    result?.status === "proposal_staged" || result?.status === "no_action";

  return (
    <section className={styles.agent} aria-labelledby="agent-composer-title">
      <header>
        <span aria-hidden="true">
          <Sparkle size={18} weight="fill" />
        </span>
        <div>
          <h3 id="agent-composer-title">Ask within this Pursuit</h3>
          <p>
            {providerMode === "live_remote"
              ? "Pinned remote model · synthetic-only processing · four governed tools"
              : "Safe deterministic provider · no model inference"}
          </p>
        </div>
        <ShieldCheck aria-label="Review-only; no external effects" size={20} />
      </header>

      {item.agentContext ? (
        <>
          <label htmlFor={`objective-${item.pursuitId}`}>Run objective</label>
          <textarea
            id={`objective-${item.pursuitId}`}
            maxLength={1_000}
            onChange={(event) => setObjective(event.target.value)}
            rows={3}
            value={objective}
          />
          <div className={styles.agentActions}>
            <p>
              Reads {item.agentContext.evidenceRefs.length} exact evidence
              {item.agentContext.evidenceRefs.length === 1 ? " fragment" : " fragments"}.
              Output remains a Proposal or no_action.
            </p>
            <button
              disabled={
                submitting || Boolean(sessionRecoveryHref) || !objective.trim()
              }
              onClick={runAgent}
              type="button"
            >
              {submitting ? "Running bounded check…" : "Run bounded Agent"}
              {!submitting && <ArrowRight aria-hidden="true" size={16} />}
            </button>
          </div>
        </>
      ) : (
        <div className={styles.agentUnavailable}>
          <WarningCircle aria-hidden="true" size={19} />
          <p>{disabledReason}</p>
        </div>
      )}

      {error ? (
        <div className={styles.runError} role="alert">
          <WarningCircle aria-hidden="true" size={19} />
          <p>
            <strong>Run not verified</strong>
            <span>{error}</span>
          </p>
        </div>
      ) : null}

      {result ? (
        <div
          className={successfulResult ? styles.runResult : styles.runStopped}
          role="status"
          aria-live="polite"
        >
          {successfulResult ? (
            <CheckCircle aria-hidden="true" size={20} weight="fill" />
          ) : (
            <WarningCircle aria-hidden="true" size={20} weight="fill" />
          )}
          <div>
            <strong>
              {result.status === "proposal_staged"
                ? "Proposal staged for review"
                : result.status === "no_action"
                  ? "No action is the supported result"
                  : `Agent stopped safely: ${result.status}`}
            </strong>
            <p>
              {result.reason.replaceAll("_", " ").toLowerCase()} · {result.externalEffectCount} external effects
            </p>
          </div>
          {result.proposalId ? (
            <Link href={`/workspace/pursuits/${item.pursuitId}#proposal`}>
              Review
              <ArrowRight aria-hidden="true" size={15} />
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FocusItem({
  item,
  providerMode,
  sessionRecoveryHref,
}: {
  item: PursuitTodayItem;
  providerMode: Props["providerMode"];
  sessionRecoveryHref: string | null;
}) {
  return (
    <article className={styles.focus} data-evidence-state={item.evidenceState}>
      <div className={styles.focusRedline} aria-hidden="true" />
      <header className={styles.focusHeader}>
        <div>
          <p className={styles.kicker}>
            <span>{kindCopy(item)}</span>
            <span>Revision {item.revision}</span>
          </p>
          <h2>{item.attentionTitle}</h2>
          <p className={styles.contextLine}>
            {item.personLabel ? `${item.personLabel} · ` : ""}
            {item.title}
          </p>
        </div>
        <div className={styles.evidenceState}>
          <FileText aria-hidden="true" size={17} />
          {evidenceCopy[item.evidenceState]}
        </div>
      </header>

      <p className={styles.focusDetail}>{item.attentionDetail}</p>

      <dl className={styles.focusFacts}>
        <div>
          <dt>Target outcome</dt>
          <dd>{humanize(item.targetOutcome)}</dd>
        </div>
        <div>
          <dt>Target date</dt>
          <dd>{formatDate(item.targetDate)}</dd>
        </div>
        <div>
          <dt>Current milestone</dt>
          <dd>{humanize(item.milestone)}</dd>
        </div>
      </dl>

      {item.action || item.gap ? (
        <div className={styles.supportingWork}>
          {item.action ? (
            <div>
              <Clock aria-hidden="true" size={18} />
              <p>
                <span>Owned action</span>
                <strong>{item.action.title}</strong>
                <small>
                  {item.action.owner} · {formatDue(item.action.dueAt)}
                </small>
              </p>
            </div>
          ) : null}
          {item.gap ? (
            <div>
              <Path aria-hidden="true" size={18} />
              <p>
                <span>Close condition</span>
                <strong>{item.gap.closeCondition}</strong>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.focusLink}>
        <Link href={pursuitHref(item)}>
          {item.attentionKind === "review" &&
          item.proposalStatus === "needs_review"
            ? "Review proposal"
            : "Open Pursuit room"}
          <ArrowRight aria-hidden="true" size={17} />
        </Link>
        <span>No state changes from opening this view.</span>
      </div>

      {item.attentionKind !== "review" ? (
        <AgentComposer
          item={item}
          providerMode={providerMode}
          sessionRecoveryHref={sessionRecoveryHref}
        />
      ) : null}
    </article>
  );
}

function Continuation({ item }: { item: PursuitTodayItem }) {
  return (
    <Link
      className={styles.continuation}
      href={pursuitHref(item)}
    >
      <div>
        <span>{kindCopy(item)}</span>
        <span>{evidenceCopy[item.evidenceState]}</span>
      </div>
      <h3>{item.attentionTitle}</h3>
      <p>
        {item.personLabel ? `${item.personLabel} · ` : ""}
        {item.title}
      </p>
      <footer>
        <span>{formatDate(item.targetDate)}</span>
        {item.action ? <span>{formatDue(item.action.dueAt)}</span> : null}
        <ArrowRight aria-hidden="true" size={16} />
      </footer>
    </Link>
  );
}

export function PursuitTodayPage({
  error,
  expanded,
  projection,
  providerMode,
  sessionRecoveryHref,
}: Props) {
  const { sessionRecoveryHref: activeSessionRecoveryHref } =
    useWorkspaceSessionRecovery(sessionRecoveryHref);
  const focus = projection?.items[0] ?? null;
  const continuations = projection?.items.slice(1) ?? [];
  const hiddenAttentionCount = Math.max(
    0,
    (projection?.attentionCount ?? 0) - (projection?.items.length ?? 0),
  );

  return (
    <div className={styles.pageShell}>
      <main className={styles.main} id="main-content">
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Governed attention</p>
            <h1>Today</h1>
            <p>
              One supported decision first. The rest stays quiet until it needs
              your judgment.
            </p>
          </div>
          <div className={styles.summary}>
            <span>
              {projection?.attentionCount ?? 0}
              <small>to consider</small>
            </span>
            <span>
              {projection?.noActionCount ?? 0}
              <small>no action</small>
            </span>
          </div>
        </header>

        {activeSessionRecoveryHref && !error ? (
          <section
            className={`${styles.pageError} ${styles.sessionRecovery}`}
            role="alert"
          >
            <WarningCircle aria-hidden="true" size={23} />
            <div>
              <h2>Sign in to continue this Pursuit.</h2>
              <p>
                The last verified Today projection remains visible. New Agent
                and review writes are paused until the account session is
                restored.
              </p>
              <Link href={activeSessionRecoveryHref}>Sign in again</Link>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className={styles.pageError} role="alert">
            <WarningCircle aria-hidden="true" size={23} />
            <div>
              <h2>Canonical readback is unavailable.</h2>
              <p>{error}</p>
              <Link href={activeSessionRecoveryHref ?? "/workspace/today"}>
                {activeSessionRecoveryHref
                  ? "Sign in again"
                  : "Retry readback"}
              </Link>
            </div>
          </section>
        ) : focus ? (
          <div className={styles.todayGrid}>
            <section aria-labelledby="focus-heading">
              <p className={styles.sectionLabel} id="focus-heading">
                Focus
              </p>
              <FocusItem
                item={focus}
                key={focus.pursuitId}
                providerMode={providerMode}
                sessionRecoveryHref={activeSessionRecoveryHref}
              />
            </section>
            <aside aria-labelledby="continue-heading">
              <p className={styles.sectionLabel} id="continue-heading">
                Continue
              </p>
              {continuations.length > 0 ? (
                <div className={styles.continuations}>
                  {continuations.map((item) => (
                    <Continuation item={item} key={item.pursuitId} />
                  ))}
                </div>
              ) : (
                <div className={styles.quietState}>
                  <CheckCircle aria-hidden="true" size={22} />
                  <p>
                    <strong>No other governed work is asking for attention.</strong>
                    <span>Quiet is a valid state.</span>
                  </p>
                </div>
              )}
              {hiddenAttentionCount > 0 ? (
                <div className={styles.queueBoundary}>
                  <p>
                    <strong>
                      {hiddenAttentionCount} lower-priority items stay quiet.
                    </strong>
                    <span>
                      The full queue is available when you intentionally need
                      it; it is not mounted into the focused view.
                    </span>
                  </p>
                  <Link href="/workspace/today?view=all">
                    Open full queue
                    <ArrowRight aria-hidden="true" size={15} />
                  </Link>
                </div>
              ) : expanded &&
                (projection?.attentionCount ?? 0) >
                  TODAY_FOCUSED_ITEM_LIMIT ? (
                <div className={styles.queueBoundary}>
                  <p>
                    <strong>Full attention queue is open.</strong>
                    <span>Return to the bounded view for ordinary work.</span>
                  </p>
                  <Link href="/workspace/today">Return to focus</Link>
                </div>
              ) : null}
            </aside>
          </div>
        ) : (
          <section className={styles.empty}>
            <CheckCircle aria-hidden="true" size={30} weight="duotone" />
            <p className={styles.eyebrow}>No supported attention</p>
            <h2>Nothing needs to be invented today.</h2>
            <p>
              {projection?.totalPursuits
                ? `${projection.noActionCount} active ${projection.noActionCount === 1 ? "Pursuit has" : "Pursuits have"} no pending review, owned action, or evidence-backed gap.`
                : "No active Pursuit has reached this workspace yet."}
            </p>
            <Link href="/workspace">Open the relationship desk</Link>
          </section>
        )}
      </main>
    </div>
  );
}
