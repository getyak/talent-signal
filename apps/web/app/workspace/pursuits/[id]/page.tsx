import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { PursuitReviewGate } from "@/components/pursuit-review-gate";
import { PursuitAgentRail } from "@/components/pursuit-agent-rail";
import styles from "@/components/pursuit-room.module.css";
import {
  backendSessionRecoveryHref,
  isBackendSessionExpiredError,
} from "@/lib/backend-session";
import {
  isPursuitIntegrationMode,
  loadPursuitRoom,
} from "@/lib/server/pursuitBackend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "规范的寻访目标、有证据支撑的缺口、行动与审阅。",
  robots: { follow: false, index: false },
  title: "寻访房间",
};

function formatDate(value: string | null): string {
  if (!value) return "尚未安排";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

const pursuitValueLabels: Record<string, string> = {
  accepted_offer: "接受录用意向",
  active: "进行中",
  cancelled: "已取消",
  completed: "已完成",
  evidence_review: "证据审阅",
  final_conversation: "最终沟通",
  interviewing: "面试中",
  mutual_final_decision: "双方最终决定",
  offer_review: "录用意向审阅",
  recruiting: "招聘",
  shortlist_review: "候选名单审阅",
};

function displayPursuitValue(value: string): string {
  return pursuitValueLabels[value] ?? value.replaceAll("_", " ");
}

export default async function PursuitRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/workspace/pursuits/${id}`)}`,
    );
  }
  if (!isPursuitIntegrationMode()) redirect("/workspace");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let room: Awaited<ReturnType<typeof loadPursuitRoom>>;
  try {
    room = await loadPursuitRoom(id);
  } catch (caught) {
    if (isBackendSessionExpiredError(caught)) {
      redirect(
        backendSessionRecoveryHref(`/workspace/pursuits/${id}`),
      );
    }
    notFound();
  }
  const { pursuit, proposals, agentContext, agentTasks } = room;
  const openGaps = pursuit.gaps.filter((gap) => gap.status === "open");
  const openActions = pursuit.actions.filter(
    (action) => !["completed", "cancelled", "failed"].includes(action.status),
  );

  return (
    <div className={styles.page}>
      <main className={styles.main} id="main-content">
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{displayPursuitValue(pursuit.type)}寻访</p>
          <h1>{pursuit.title}</h1>
          <p>{displayPursuitValue(pursuit.target_outcome)}</p>
          <dl>
            <div>
              <dt>目标日期</dt>
              <dd>{formatDate(pursuit.target_date)}</dd>
            </div>
            <div>
              <dt>里程碑</dt>
              <dd>{displayPursuitValue(pursuit.milestone)}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{displayPursuitValue(pursuit.status)}</dd>
            </div>
            <div>
              <dt>修订版本</dt>
              <dd>{pursuit.revision}</dd>
            </div>
          </dl>
        </section>

        <div className={styles.contentGrid}>
          <div>
            <section className={styles.section}>
              <header>
                <div>
                  <p>依赖项</p>
                  <h2>待解决缺口</h2>
                </div>
                <span>{openGaps.length} 项待解决</span>
              </header>
              {openGaps.length ? (
                <div className={styles.rows}>
                  {openGaps.map((gap) => (
                    <article className={styles.row} key={gap.id}>
                      <div>
                        <strong>{gap.title}</strong>
                        <span>{gap.basis.evidence_state.availability}</span>
                      </div>
                      <p>{gap.close_condition}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className={styles.quiet}>没有记录待解决缺口。</p>
              )}
            </section>

            <section className={styles.section}>
              <header>
                <div>
                  <p>已分配工作</p>
                  <h2>内部行动</h2>
                </div>
                <span>{openActions.length} 项进行中</span>
              </header>
              {openActions.length ? (
                <div className={styles.rows}>
                  {openActions.map((action) => (
                    <article className={styles.row} key={action.id}>
                      <div>
                        <strong>{action.title}</strong>
                        <span>{displayPursuitValue(action.status)}</span>
                      </div>
                      <p>
                        {action.owner_display_name} · {formatDate(action.due_at)} · 无外部效果
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className={styles.quiet}>没有进行中的已分配行动。</p>
              )}
            </section>
          </div>

          <PursuitAgentRail
            agentContext={agentContext}
            evidenceHref={proposals.length > 0 ? "#proposal" : null}
            initialTask={agentTasks[0] ?? null}
            pursuit={{
              id: pursuit.id,
              milestone: pursuit.milestone,
              revision: pursuit.revision,
              title: pursuit.title,
            }}
          />

          <PursuitReviewGate
            decisionBundle={agentTasks[0]?.decision_bundle ?? undefined}
            key={pursuit.id}
            proposals={proposals}
          />
        </div>
      </main>
    </div>
  );
}
