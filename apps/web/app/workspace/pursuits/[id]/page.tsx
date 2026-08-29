import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { PursuitReviewGate } from "@/components/pursuit-review-gate";
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
  description: "Canonical Pursuit outcome, evidence-backed gaps, actions, and review.",
  robots: { follow: false, index: false },
  title: "Pursuit room",
};

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
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
  const { pursuit, proposals } = room;
  const openGaps = pursuit.gaps.filter((gap) => gap.status === "open");
  const openActions = pursuit.actions.filter(
    (action) => !["completed", "cancelled", "failed"].includes(action.status),
  );

  return (
    <div className={styles.page}>
      <main className={styles.main} id="main-content">
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{pursuit.type} pursuit</p>
          <h1>{pursuit.title}</h1>
          <p>{pursuit.target_outcome.replaceAll("_", " ")}</p>
          <dl>
            <div>
              <dt>Target date</dt>
              <dd>{formatDate(pursuit.target_date)}</dd>
            </div>
            <div>
              <dt>Milestone</dt>
              <dd>{pursuit.milestone.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{pursuit.status}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{pursuit.revision}</dd>
            </div>
          </dl>
        </section>

        <div className={styles.contentGrid}>
          <div>
            <section className={styles.section}>
              <header>
                <div>
                  <p>Dependencies</p>
                  <h2>Open gaps</h2>
                </div>
                <span>{openGaps.length} open</span>
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
                <p className={styles.quiet}>No open gap is recorded.</p>
              )}
            </section>

            <section className={styles.section}>
              <header>
                <div>
                  <p>Owned work</p>
                  <h2>Internal actions</h2>
                </div>
                <span>{openActions.length} open</span>
              </header>
              {openActions.length ? (
                <div className={styles.rows}>
                  {openActions.map((action) => (
                    <article className={styles.row} key={action.id}>
                      <div>
                        <strong>{action.title}</strong>
                        <span>{action.status.replaceAll("_", " ")}</span>
                      </div>
                      <p>
                        {action.owner_display_name} · {formatDate(action.due_at)} · no external effect
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className={styles.quiet}>No owned action is open.</p>
              )}
            </section>
          </div>

          <PursuitReviewGate key={pursuit.id} proposals={proposals} />
        </div>
      </main>
    </div>
  );
}
