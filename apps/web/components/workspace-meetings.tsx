import type { MeetingDraftRecord } from "@talent-signal/contracts";
import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  ChatCircleDots,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import {
  adjacentMeetingMonth,
  meetingCalendarDays,
  meetingDraftCalendarValue,
  meetingDraftExpiryLabel,
  meetingDraftLocalDay,
} from "@/lib/meeting-calendar";
import { CalendarDraftReview } from "./calendar-draft-review";
import { MeetingDraftDismiss } from "./meeting-draft-actions";
import { MeetingDraftPendingBoundary } from "./meeting-draft-pending-boundary";
import { MeetingMonthGrid } from "./meeting-month-grid";

import styles from "./workspace-meetings.module.css";

const week = ["一", "二", "三", "四", "五", "六", "日"];

function parameters(input: {
  month: string;
  day?: string | null;
  draft?: string | null;
}) {
  const value = new URLSearchParams({ month: input.month });
  if (input.day) value.set("day", input.day);
  if (input.draft) value.set("draft", input.draft);
  return `/workspace/meetings?${value.toString()}`;
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}-01T12:00:00Z`));
}

function timeLabel(draft: MeetingDraftRecord) {
  if (!draft.starts_at || !draft.ends_at || !draft.time_zone) return "时间不可用";
  const format = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: draft.time_zone,
  });
  return `${format.format(new Date(draft.starts_at))}–${format.format(new Date(draft.ends_at))}`;
}

function statusLabel(status: MeetingDraftRecord["status"]) {
  if (status === "needs_review") return "待核对";
  if (status === "dismissed") return "已移除";
  if (status === "expired") return "已过期";
  return "来源不可用";
}

export function WorkspaceMeetings({
  day,
  drafts,
  error,
  inactiveTruncated,
  month,
  selectedDraftId,
  requestedDraftUnavailable,
  sessionVersion,
}: {
  day: string;
  drafts: MeetingDraftRecord[];
  error: string | null;
  inactiveTruncated: boolean;
  month: string;
  selectedDraftId: string | null;
  requestedDraftUnavailable: boolean;
  sessionVersion: string;
}) {
  const active = drafts.filter((draft) => draft.status === "needs_review");
  const agenda = active.filter((draft) => meetingDraftLocalDay(draft) === day);
  const selected =
    agenda.find((draft) => draft.id === selectedDraftId) ?? agenda[0] ?? null;
  const exportDraft = selected ? meetingDraftCalendarValue(selected) : null;
  const inactive = drafts.filter((draft) => draft.status !== "needs_review");
  const days = meetingCalendarDays(month, active);

  return (
    <main className={styles.page} id="main-content" tabIndex={-1}>
      {!error ? (
        <MeetingDraftPendingBoundary
          activeDraftIds={active.map((draft) => draft.id)}
          sessionVersion={sessionVersion}
        />
      ) : null}
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>准备，不是执行</p>
          <h1>会议</h1>
          <p>
            这里只显示智能助理生成并绑定原对话的日历草稿。选择日期或编辑时间不会创建事件；导入仍由日历应用确认。
          </p>
        </div>
        <Link className={styles.newConversation} href="/workspace?surface=desk&intent=compose">
          <ChatCircleDots aria-hidden="true" size={17} />
          准备新会议
        </Link>
      </header>

      {error ? (
        <section className={styles.error} role="alert">
          <WarningCircle aria-hidden="true" size={20} />
          <div>
            <strong>会议草稿暂时无法读取</strong>
            <p>{error} 系统没有使用缓存、示例日程或浏览器时间推断替代。</p>
            <Link href={parameters({ month, day })}>重新读取</Link>
          </div>
        </section>
      ) : (
        <>
          {requestedDraftUnavailable ? (
            <p className={styles.deepLinkNotice} role="status">
              这份草稿已处理、来源不可用，或不属于当前账号。没有导出旧内容。
            </p>
          ) : null}
          <div className={styles.workspace}>
          <section aria-labelledby="calendar-title" className={styles.calendarPane}>
            <header className={styles.monthHeader}>
              <Link
                aria-label="上个月"
                href={parameters({ month: adjacentMeetingMonth(month, -1) })}
              >
                <ArrowLeft aria-hidden="true" size={16} />
              </Link>
              <h2 id="calendar-title">{monthLabel(month)}</h2>
              <Link
                aria-label="下个月"
                href={parameters({ month: adjacentMeetingMonth(month, 1) })}
              >
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </header>
            <div aria-hidden="true" className={styles.weekdays}>
              {week.map((label) => <span key={label}>{label}</span>)}
            </div>
            <MeetingMonthGrid days={days} month={month} selectedDay={day} />
          </section>

          <section aria-labelledby="agenda-title" className={styles.agendaPane}>
            <header className={styles.agendaHeading}>
              <div>
                <p>{day}</p>
                <h2 id="agenda-title">待核对草稿</h2>
              </div>
              <span>{agenda.length}</span>
            </header>
            {agenda.length ? (
              <ol className={styles.agendaList}>
                {agenda.map((draft) => (
                  <li key={draft.id}>
                    <Link
                      aria-current={selected?.id === draft.id ? "true" : undefined}
                      href={parameters({ month, day, draft: draft.id })}
                    >
                      <time dateTime={draft.starts_at ?? undefined}>{timeLabel(draft)}</time>
                      <strong>{draft.title}</strong>
                      <small>{draft.time_zone} · {statusLabel(draft.status)}</small>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className={styles.empty} role="status">
                <CalendarBlank aria-hidden="true" size={22} weight="duotone" />
                <div>
                  <strong>这一天没有待核对草稿</strong>
                  <p>选择有数字标记的日期，或从一段对话准备新的会议草稿。</p>
                </div>
              </div>
            )}
          </section>

          <aside aria-labelledby="meeting-context-title" className={styles.contextPane}>
            <header>
              <p>会议情境</p>
              <h2 id="meeting-context-title">{selected?.title ?? "选择一份草稿"}</h2>
            </header>
            {selected && exportDraft ? (
              <>
                <dl className={styles.contextMeta}>
                  <div><dt>来源</dt><dd>对话任务 {selected.source_task_id.slice(0, 8)}</dd></div>
                  <div><dt>权限</dt><dd>无外部写入</dd></div>
                  <div><dt>修订</dt><dd>{selected.revision}</dd></div>
                </dl>
                <CalendarDraftReview
                  draft={exportDraft}
                  key={selected.id}
                  persistence={{
                    draftId: selected.id,
                    expiresAt: selected.expires_at,
                    revision: selected.revision,
                    sessionVersion,
                  }}
                />
                <div className={styles.contextLinks}>
                  <Link href={`/workspace/sessions/${encodeURIComponent(selected.origin_session_id)}`}>
                    回到来源对话
                  </Link>
                  <MeetingDraftDismiss
                    draftId={selected.id}
                    expiresAt={selected.expires_at}
                    expiresLabel={meetingDraftExpiryLabel(selected)}
                    key={selected.id}
                    revision={selected.revision}
                    returnHref={parameters({ month, day })}
                    sessionVersion={sessionVersion}
                  />
                </div>
              </>
            ) : (
              <p className={styles.contextEmpty}>
                日期选择只改变当前视图。打开草稿后才能核对原文、时区和导出内容。
              </p>
            )}
          </aside>
          </div>
        </>
      )}

      {!error && inactive.length ? (
        <details className={styles.unavailable}>
          <summary>
            {inactiveTruncated
              ? `最近 ${inactive.length} 份草稿已处理或不可用`
              : `${inactive.length} 份草稿已处理或不可用`}
          </summary>
          <ul>
            {inactive.map((draft) => (
              <li key={draft.id}>
                {statusLabel(draft.status)} · {draft.content_available ? draft.title : "内容已清除"} · {draft.updated_at}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </main>
  );
}
