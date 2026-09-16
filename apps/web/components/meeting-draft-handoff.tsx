import type { CalendarDraft } from "@talent-signal/contracts";
import { ArrowRight, CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

/**
 * Session answers are an immutable task view, not meeting-draft authority.
 * Route every review/export through the account-scoped MeetingDraft projection
 * so edits, dismissal, retention, and source revocation are re-read first.
 */
export function MeetingDraftHandoff({
  draft,
  persistence,
}: {
  draft: CalendarDraft;
  persistence: "persisted" | "unbound";
}) {
  const persisted = persistence === "persisted";
  return (
    <section aria-label="日历草稿核对入口" className="context-calendar-draft-handoff">
      <CalendarBlank aria-hidden="true" size={18} weight="duotone" />
      <div>
        <strong>{draft.title}</strong>
        <p>
          {persisted
            ? "草稿已保存到会议。当前页面不能直接导出，以免使用过期或已撤回的内容。"
            : "这份建议未绑定可恢复的 Session，因此没有保存为会议草稿，也不能从当前页面导出。"}
        </p>
        {persisted ? (
          <Link href={`/workspace/meetings?draft=${encodeURIComponent(draft.id)}`}>
            在会议中核对并下载
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
