"use client";

import { useState } from "react";
import type { CalendarDraft } from "@talent-signal/contracts";
import { calendarDraftFile, calendarLocalTime, calendarUTCFromLocal } from "@/lib/calendar-draft";

import styles from "./agent-review-form.module.css";

export function CalendarDraftReview({ draft }: { draft: CalendarDraft }) {
  const [generated, setGenerated] = useState(false);
  const [title, setTitle] = useState(draft.title);
  const [start, setStart] = useState(() => calendarLocalTime(draft.starts_at, draft.time_zone));
  const [end, setEnd] = useState(() => calendarLocalTime(draft.ends_at, draft.time_zone));
  const [error, setError] = useState<string | null>(null);
  return <section className={styles.review} aria-label="日历草稿" data-testid="calendar-draft-review">
    <h3>核对日历草稿</h3>
    <label className={styles.field}>标题<input value={title} maxLength={200} onChange={event => { setTitle(event.target.value); setGenerated(false); }} /></label>
    <label className={styles.field}>开始时间<input type="datetime-local" value={start} onChange={event => { setStart(event.target.value); setGenerated(false); }} /></label>
    <label className={styles.field}>结束时间<input type="datetime-local" value={end} onChange={event => { setEnd(event.target.value); setGenerated(false); }} /></label>
    <p>{draft.time_zone} · 待确认，尚未创建日历事件</p>
    <details><summary>查看原文</summary><blockquote>{draft.source_excerpt}</blockquote></details>
    <button className={styles.primary} type="button" onClick={() => {
      let reviewed: CalendarDraft;
      try {
        reviewed = { ...draft, title: title.trim(), starts_at: calendarUTCFromLocal(start, draft.time_zone), ends_at: calendarUTCFromLocal(end, draft.time_zone) };
        const duration = Date.parse(reviewed.ends_at) - Date.parse(reviewed.starts_at);
        if (!reviewed.title || duration <= 0 || duration > 7 * 86_400_000) throw new Error("invalid_interval");
      } catch { setError("请核对标题和起止时间；夏令时切换产生的重复或不存在时间不能直接导出。"); return; }
      setError(null);
      const url = URL.createObjectURL(new Blob([calendarDraftFile(reviewed)], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "calendar-draft.ics";
      document.body.append(link); link.click(); link.remove(); setGenerated(true);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>下载日历草稿</button>
    {error && <p role="alert">{error}</p>}
    <p role="status">{generated ? "已生成日历文件，请在日历应用中核对并确认导入。" : "只导出标题和时间，导入由你的日历应用确认。"}</p>
  </section>;
}
