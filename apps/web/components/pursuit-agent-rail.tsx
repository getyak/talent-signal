"use client";

import type { AgentTaskProjection } from "@talent-signal/contracts";
import {
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  FileText,
  Pause,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  workspaceSessionExpired,
  workspaceSessionFetch,
} from "./workspace-session-request";
import styles from "./pursuit-agent-rail.module.css";

type Props = {
  pursuit: {
    id: string;
    title: string;
    revision: number;
    milestone: string;
  };
  agentContext: {
    captureId: string;
    evidenceRefs: string[];
  } | null;
  initialTask: AgentTaskProjection | null;
  evidenceHref: string | null;
};

const runningStatuses = new Set<AgentTaskProjection["status"]>(["active"]);

const statusCopy: Record<AgentTaskProjection["status"], string> = {
  active: "正在核对受治理的上下文",
  waiting_for_clarification: "等待一项澄清",
  waiting_for_domain_decision: "等待你的决定",
  waiting_for_external: "等待外部结果核验",
  needs_rebase: "寻访已变化，需要重新建立快照",
  completed: "简报已完成",
  no_action: "当前无需新增行动",
  abstained: "已安全停止，可由你决定是否继续",
  failed: "运行未完成，没有规范状态被改变",
  cancelled: "任务已取消",
  expired: "任务已过期",
};

function formatObservedAt(value: string | null): string {
  if (!value) return "未记录观察时间";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZone: "UTC",
      }).format(parsed);
}

export function PursuitAgentRail({
  pursuit,
  agentContext,
  initialTask,
  evidenceHref,
}: Props) {
  const router = useRouter();
  const [task, setTask] = useState(initialTask);
  const [busy, setBusy] = useState<"create" | "cancel" | "">("");
  const [error, setError] = useState<string | null>(null);
  const objective = useMemo(
    () =>
      `为“${pursuit.title}”准备通话前简报：只使用已审阅且仍获授权的证据，说明发生了什么、当前依赖，以及一个最小安全下一步；证据不足时明确记录无需行动。`,
    [pursuit.title],
  );

  useEffect(() => {
    if (!task || !runningStatuses.has(task.status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const readback = async () => {
      try {
        const response = await workspaceSessionFetch(
          `/api/pursuit-agent-tasks/${task.id}`,
        );
        const payload = (await response.json()) as {
          task?: AgentTaskProjection;
          error?: { message?: string };
        };
        if (workspaceSessionExpired(response.status, payload) || cancelled) return;
        if (!response.ok || !payload.task) {
          throw new Error(payload.error?.message ?? "任务读回暂时不可用。");
        }
        setTask(payload.task);
        if (runningStatuses.has(payload.task.status)) {
          timer = setTimeout(readback, 900);
        } else {
          router.refresh();
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "任务读回暂时不可用。",
          );
        }
      }
    };
    timer = setTimeout(readback, 500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, task]);

  async function createTask() {
    if (!agentContext || busy) return;
    setBusy("create");
    setError(null);
    try {
      const response = await workspaceSessionFetch("/api/pursuit-agent-tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pursuit_id: pursuit.id,
          idempotency_key: crypto.randomUUID(),
          client_event_id: crypto.randomUUID(),
          expected_revision: pursuit.revision,
          task_kind: "pre_call_briefing",
          capture_id: agentContext.captureId,
          objective,
          evidence_refs: agentContext.evidenceRefs,
        }),
      });
      const payload = (await response.json()) as {
        task?: AgentTaskProjection;
        error?: { message?: string; details?: { task_id?: string } };
      };
      if (workspaceSessionExpired(response.status, payload)) return;
      if (response.status === 409 && payload.error?.details?.task_id) {
        const existing = await workspaceSessionFetch(
          `/api/pursuit-agent-tasks/${payload.error.details.task_id}`,
        );
        const existingPayload = (await existing.json()) as {
          task?: AgentTaskProjection;
        };
        if (existing.ok && existingPayload.task) {
          setTask(existingPayload.task);
          return;
        }
      }
      if (!response.ok || !payload.task) {
        throw new Error(
          payload.error?.message ??
            "任务未被可靠接受；没有规范状态被改变。",
        );
      }
      setTask(payload.task);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "任务未被可靠接受；没有规范状态被改变。",
      );
    } finally {
      setBusy("");
    }
  }

  async function cancelTask() {
    if (!task || task.status !== "active" || busy) return;
    setBusy("cancel");
    setError(null);
    try {
      const response = await workspaceSessionFetch(
        `/api/pursuit-agent-tasks/${task.id}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            expected_revision: task.task_revision,
            reason: "Recruiter cancelled the pre-call briefing.",
          }),
        },
      );
      const payload = (await response.json()) as {
        task?: AgentTaskProjection;
        error?: { message?: string };
      };
      if (workspaceSessionExpired(response.status, payload)) return;
      if (!response.ok || !payload.task) {
        throw new Error(payload.error?.message ?? "无法核验取消结果。");
      }
      setTask(payload.task);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法核验取消结果。");
    } finally {
      setBusy("");
    }
  }

  const artifact = task?.artifact ?? null;
  const isStale = artifact?.status === "stale";
  const proposalID = task?.decision_bundle?.proposal_id ??
    task?.latest_run?.proposal_id ?? null;

  return (
    <aside className={styles.rail} aria-labelledby="pursuit-agent-title">
      <header className={styles.header}>
        <div className={styles.mark} aria-hidden="true">
          <Sparkle size={17} weight="fill" />
        </div>
        <div>
          <p>受治理的简报</p>
          <h2 id="pursuit-agent-title">现在最重要的是什么</h2>
        </div>
        <ShieldCheck aria-label="仅限审阅；没有外部效果" size={21} />
      </header>

      {!task ? (
        <div className={styles.start}>
          <p>
            先给出变化、当前依赖和一项最小下一步。简报不会确认事实、评价候选人或执行外部动作。
          </p>
          {agentContext ? (
            <>
              <span>
                将读取 {agentContext.evidenceRefs.length} 条已审阅证据 · 修订版本 {pursuit.revision}
              </span>
              <button disabled={busy === "create"} onClick={() => void createTask()}>
                {busy === "create" ? "正在接受任务…" : "准备通话前简报"}
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            </>
          ) : (
            <div className={styles.boundary}>
              <WarningCircle aria-hidden="true" size={18} />
              <p>
                <strong>还不能形成有根据的简报。</strong>
                <span>此寻访尚无可用的已审阅证据清单；系统不会用完整档案或未确认来源填空。</span>
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={styles.status} data-status={task.status}>
            {task.status === "active" ? (
              <ClockCounterClockwise aria-hidden="true" size={18} />
            ) : task.status === "failed" || task.status === "needs_rebase" ? (
              <WarningCircle aria-hidden="true" size={18} />
            ) : (
              <CheckCircle aria-hidden="true" size={18} />
            )}
            <p>
              <strong>{statusCopy[task.status]}</strong>
              <span>
                任务修订 {task.task_revision} · 事件 {task.latest_sequence} · 外部效果 0
              </span>
            </p>
            {task.status === "active" ? (
              <button disabled={busy === "cancel"} onClick={() => void cancelTask()}>
                <Pause aria-hidden="true" size={14} />
                取消
              </button>
            ) : null}
          </div>

          {artifact ? (
            <div className={styles.briefing} data-stale={isStale || undefined}>
              <section>
                <p className={styles.label}>发生了什么</p>
                {isStale ? (
                  <div className={styles.stale}>
                    来源权限、内容或有效期已经变化。以下内容只保留为历史，不再作为当前证据。
                  </div>
                ) : null}
                {artifact.what_changed.length ? (
                  <ol className={styles.claims}>
                    {artifact.what_changed.map((claim) => (
                      <li key={claim.id}>
                        <FileText aria-hidden="true" size={16} />
                        <div>
                          <p>{claim.statement}</p>
                          <span>
                            {claim.epistemic_status === "observed_evidence"
                              ? "已审阅的来源内容"
                              : claim.epistemic_status}
                            {" · "}
                            {formatObservedAt(claim.observed_at)}
                          </span>
                        </div>
                        {evidenceHref ? <Link href={evidenceHref}>证据</Link> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.quiet}>没有足够的新证据可列为变化。</p>
                )}
              </section>

              <section className={styles.dependency}>
                <p className={styles.label}>当前依赖</p>
                <h3>{artifact.what_matters_now.dependency}</h3>
                <p>{artifact.what_matters_now.reason}</p>
              </section>

              <section className={styles.nextMove}>
                <p className={styles.label}>我能做什么</p>
                <strong>{artifact.next_move.label}</strong>
                <span>{artifact.next_move.reason}</span>
                {proposalID ? (
                  <Link href={`/workspace/pursuits/${pursuit.id}#proposal`}>
                    审阅准确提案
                    <ArrowRight aria-hidden="true" size={15} />
                  </Link>
                ) : null}
              </section>

              <details className={styles.details}>
                <summary>范围与限制</summary>
                <ul>
                  {artifact.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
                <p>
                  快照修订 {task.semantic_snapshot.pursuit_revision} · 观察于 {formatObservedAt(artifact.observed_at)}
                </p>
              </details>
            </div>
          ) : task.status === "active" ? (
            <div className={styles.working} role="status" aria-live="polite">
              <span aria-hidden="true" />
              <p>
                <strong>正在重建公开任务状态并核对最小证据清单。</strong>
                <span>离开页面不会丢失任务；返回时以规范快照为准。</span>
              </p>
            </div>
          ) : null}
        </>
      )}

      {error ? (
        <div className={styles.error} role="alert">
          <WarningCircle aria-hidden="true" size={18} />
          <p>{error}</p>
        </div>
      ) : null}
    </aside>
  );
}
