"use client";

import { ArrowDown, ArrowUp, Check, PencilSimple, Stop, Trash, X } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { conversationHome } from "@/lib/conversation-local";
import type { LegacyConversationRecovery } from "@/lib/conversation-legacy";
import { isNewConversationId, newConversationCaptureHref } from "@/lib/new-conversation";
import { WORKSPACE_NEW_CONVERSATION_EVENT } from "@/lib/workspace-navigation";
import { ConversationResponse } from "../conversation-response";
import { ComposerAddMenu } from "../new-conversation-add-menu";
import { WorkspaceComposer } from "../workspace-composer";
import type { SessionDetail } from "../session-workbench/session-detail-state";
import { conversationNearBottom, sessionBlockTitle, sessionTurnBlocks } from "../session-workbench/session-presentation";
import { LegacyRecoveryNotice } from "./legacy-recovery-notice";
import { useConversation } from "./use-conversation";
import styles from "./queued-conversation.module.css";

const CapturePanel = dynamic(() => import("../relationship-workspace/screenshot-capture-panel").then(module => module.CapturePanel), { loading: () => <p role="status">正在打开截图导入…</p> });
const stages: Record<string, string> = { queued: "等待开始", preparing: "正在准备回复", thinking: "正在处理", contact_lookup: "正在查找相关人物", contact_read: "正在阅读相关记录", calendar_draft: "正在整理日程草稿", answer: "正在回复", responding: "正在回复", persisting: "正在保存回复", running: "正在处理" };
function Identity() { return <div className={styles.identity}><span className={styles.mark} aria-hidden="true" />Talent Signal</div>; }

type Props = { initialDetail?: SessionDetail; scope: string; chatBinding: string; detailBinding: string; meetingLinks?: Array<{id: string; title: string}>; meetingReadFailed?: boolean; legacyRecovery?: LegacyConversationRecovery | null };
export function QueuedConversation(props: Props) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(props.initialDetail?.session_id ?? null);
  const [admitted, setAdmitted] = useState(Boolean(props.initialDetail));
  const handedOff = useRef(Boolean(props.initialDetail));
  const navigating = useRef(false);
  useEffect(() => {
    // A Next Link can be pending while the old pathname is still visible.
    const leaving = () => { navigating.current = true; };
    const linkIntent = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const destination = new URL(link.href);
      if (destination.origin === window.location.origin && (destination.pathname !== window.location.pathname || destination.search !== window.location.search)) {
        leaving();
        // The retained Home tree is reused when a brand link returns home.
        if (!props.initialDetail && handedOff.current && destination.pathname === "/workspace" && !destination.search && !destination.hash) window.dispatchEvent(new Event(WORKSPACE_NEW_CONVERSATION_EVENT));
      }
    };
    document.addEventListener("click", linkIntent, true);
    window.addEventListener("popstate", leaving);
    return () => { document.removeEventListener("click", linkIntent, true); window.removeEventListener("popstate", leaving); };
  }, [props.initialDetail]);
  useEffect(() => { let current = true; queueMicrotask(() => { if (current && !props.initialDetail) { const next = conversationHome(props.scope) ?? crypto.randomUUID(); conversationHome(props.scope, next); setId(next); } }); return () => { current = false; }; }, [props.scope, props.initialDetail]);
  const chat = useConversation({ id, scope: props.scope, chatBinding: props.chatBinding, detailBinding: props.detailBinding, initial: props.initialDetail, onAdmitted: sessionId => {
    if (handedOff.current) return;
    handedOff.current = true;
    setAdmitted(true);
    if (conversationHome(props.scope) === sessionId) conversationHome(props.scope, null);
    // Admission must not reload the route and unmount an actively edited composer.
    // Next integrates native History API updates with usePathname; refresh still
    // opens the canonical Session. Do not rewrite an intervening navigation.
    // https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api
    if (!navigating.current && window.location.pathname === "/workspace" && !window.location.search && !window.location.hash) {
      window.history.replaceState(null, "", `/workspace/sessions/${sessionId}`);
    }
  } });
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [capture, setCapture] = useState(false);
  const [notice, setNotice] = useState("");
  const [away, setAway] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const viewport = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null); const follows = useRef(true); const userScroll = useRef(false);
  const active = chat.snapshot?.active;
  const queued = chat.snapshot?.queued ?? [];
  const turns = chat.detail?.turns ?? [];
  const canSend = chat.ready && !chat.unavailable && Boolean(chat.draft.trim()) && chat.draft.trim().length <= 1000 && queued.length + chat.messages.length + (active ? 1 : 0) < 50;
  const activeVisible = active && !turns.some(turn => turn.id === active.message_id);
  const forming = chat.preview?.run_id === active?.run_id ? chat.preview : null;
  const paused = chat.snapshot?.paused ?? false;
  const hasContent = Boolean(turns.length || chat.messages.length || active || queued.length);
  const status = chat.unavailable ? "这段对话已不可用" : chat.connection === "reconnecting" && hasContent ? "连接恢复中，消息已保留" : active?.cancel_requested ? "正在停止…" : active ? (stages[forming?.stage ?? active.stage ?? ""] ?? "正在处理") : paused ? "已暂停，可继续发送到队列" : queued.length ? `${queued.length} 条消息等待处理` : "";
  useEffect(() => {
    if (!active?.run_id) return;
    const start = Date.now(); const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active?.run_id]);
  useEffect(() => {
    const node = content.current; const scroll = viewport.current; if (!node || !scroll) return;
    const observer = new ResizeObserver(() => { if (follows.current) scroll.scrollTop = scroll.scrollHeight; else setAway(true); });
    observer.observe(node); observer.observe(scroll); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (chat.ready && chat.draft && props.initialDetail) document.getElementById("queued-conversation-composer")?.focus(); /* Restore focus only at initial hydration. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.ready]);
  function latest() { userScroll.current = false; follows.current = true; setAway(false); viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  function send() { if (chat.submit()) { userScroll.current = false; follows.current = true; setAway(false); } }
  function navigate(href: string) { navigating.current = true; router.push(href); }
  async function remove() {
    if (await chat.remove()) {
      window.dispatchEvent(new Event(WORKSPACE_NEW_CONVERSATION_EVENT));
      router.replace("/workspace");
    }
  }
  async function applyEdit(entry: string) { if (await chat.mutate({ kind: "edit", queue_entry_id: entry, objective: editValue.trim() })) setEditing(null); }

  return <section className={styles.canvas} aria-label="对话" data-conversation-canvas data-empty={!hasContent}>
    {admitted && <header className={styles.header}><h1>{chat.detail?.title || "新对话"}</h1><details className={styles.details}><summary>对话详情</summary><div className={styles.detailPanel}>
      <p>历史回复保留当时的判断，执行前请核对当前信息。</p>
      {chat.detail && <p>保留至 {new Date(chat.detail.expires_at).toLocaleDateString("zh-CN")}</p>}
      {props.meetingLinks?.map(meeting => <a key={meeting.id} href={`/workspace/meetings?draft=${encodeURIComponent(meeting.id)}`}>{meeting.title}</a>)}
      {props.meetingReadFailed && <p>相关日程暂时无法读取。</p>}
      {!chat.unavailable && (confirmDelete ? <div className={styles.confirm}><p>删除对话、草稿和待处理消息？</p><button onClick={() => void remove()}>确认删除</button><button onClick={() => setConfirmDelete(false)}>保留</button></div> : <button className={styles.textButton} onClick={() => setConfirmDelete(true)}><Trash size={16}/>删除对话</button>)}
    </div></details></header>}
    <div className={styles.transcript} ref={viewport} role="region" aria-label="对话记录" tabIndex={0} onWheel={() => { userScroll.current = true; }} onTouchStart={() => { userScroll.current = true; }} onPointerDown={() => { userScroll.current = true; }} onKeyDown={event => { if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) userScroll.current = true; }} onScroll={() => { if (viewport.current && userScroll.current) { follows.current = conversationNearBottom(viewport.current); setAway(!follows.current); } }}>
      <div className={styles.content} ref={content}>
        {!hasContent && <div className={styles.welcome}><span className={styles.welcomeMark} aria-hidden="true"/><h2>今天想推进什么？</h2></div>}
        {turns.map(turn => <article className={styles.turn} key={turn.id}><div className={styles.userRow}><div className={styles.userMessage}>{turn.objective}</div></div><div className={styles.answer}><Identity/>{sessionTurnBlocks(turn.response).map((block, index) => <div key={index}>{sessionBlockTitle(block.title) && <h3>{sessionBlockTitle(block.title)}</h3>}<ConversationResponse>{block.body}</ConversationResponse></div>)}</div></article>)}
        {activeVisible && <article className={styles.turn} key={active.message_id}><div className={styles.userRow}><div className={styles.userMessage}>{active.objective}</div></div><div className={styles.answer}><Identity/>{forming?.text ? <div className={styles.forming}><ConversationResponse>{forming.text}</ConversationResponse><span className={styles.cursor} aria-hidden="true"/></div> : <div className={styles.waiting}><span className={styles.pulse} aria-hidden="true"/>{status}</div>}<div className={styles.runMeta}>{forming?.text ? status : ""}{seconds >= 8 && <span>{seconds} 秒{seconds >= 20 ? " · 可以继续补充，我会按顺序处理" : ""}</span>}</div></div></article>}
        {chat.messages.map(message => <article className={styles.localTurn} key={message.id}><div className={styles.userRow}><div className={styles.userMessage}>{message.objective}</div></div><div className={styles.delivery}>{message.delivery === "accepted" ? <><Check size={12}/>已送达</> : message.delivery === "unknown" || message.delivery === "rejected" ? <>{message.error || "送达结果尚未确认，请核对后重试。"}<button onClick={() => void chat.retryDelivery(message)}>核对并重试</button>{message.delivery === "rejected" && <button onClick={() => chat.discardRejectedDelivery(message.id)}>移除</button>}</> : message.delivery === "pending" ? "等待送达" : "正在送达…"}</div></article>)}
      </div>
    </div>
    <div className={styles.dock}>
      {away && <button className={styles.latest} onClick={latest}><ArrowDown size={15}/>回到最新</button>}
      {props.legacyRecovery && <LegacyRecoveryNotice key={props.legacyRecovery.sessionId} recovery={props.legacyRecovery}/>}
      {queued.length > 0 && <section className={styles.queue} aria-label="待处理消息"><div className={styles.queueHeading}><span>{paused ? "已暂停" : "接下来"}<small>{queued.length}</small></span>{paused && <button disabled={chat.mutating || Boolean(active) || queued.some(entry => entry.status !== "queued")} onClick={() => void chat.mutate({kind:"continue"})}>继续处理<ArrowUp size={13}/></button>}</div>
        <ol>{queued.map((entry, index) => <li key={entry.queue_entry_id}>{editing === entry.queue_entry_id ? <form className={styles.edit} onSubmit={event => { event.preventDefault(); void applyEdit(entry.queue_entry_id); }}><label htmlFor={`edit-${entry.queue_entry_id}`}>编辑待处理消息</label><textarea autoFocus id={`edit-${entry.queue_entry_id}`} value={editValue} maxLength={1000} onChange={event => setEditValue(event.target.value)}/><div><button type="button" onClick={() => setEditing(null)}>取消</button><button type="submit" disabled={!editValue.trim() || chat.mutating}>保存</button></div></form> : <><span className={styles.number}>{index + 1}</span><span className={styles.queueText}>{entry.objective}{["failed", "interrupted"].includes(entry.status) && <small>上次未完成，请重试或移除</small>}</span><div className={styles.queueActions}>{entry.status === "queued" ? <button aria-label={`编辑第 ${index + 1} 条待处理消息`} disabled={chat.mutating} onClick={() => { setEditing(entry.queue_entry_id); setEditValue(entry.objective); }}><PencilSimple size={16}/></button> : <button disabled={chat.mutating} onClick={async () => { if (await chat.mutate({kind:"retry",queue_entry_id:entry.queue_entry_id})) await chat.mutate({kind:"continue"}); }}>重试</button>}<button aria-label={`移除第 ${index + 1} 条待处理消息`} disabled={chat.mutating} onClick={() => void chat.mutate({kind:"withdraw",queue_entry_id:entry.queue_entry_id})}><X size={16}/></button></div></>}</li>)}</ol>
      </section>}
      {(chat.error || notice || chat.draftConflict || chat.unavailable) && <div className={styles.notice} role="status">{chat.unavailable ? "这段对话已结束或登录状态发生变化，请重新打开工作台。" : chat.draftConflict ? <>另一处也修改了草稿，当前输入已保留。<button onClick={() => void chat.keepDraft()}>保留当前草稿</button></> : chat.error || notice}</div>}
      <div className={styles.composer}>
        <WorkspaceComposer id="queued-conversation-composer" label="消息" value={chat.draft} maxLength={1000} variant="home" rows={2} placeholder={active ? "继续补充，会按顺序处理…" : paused ? "继续输入，消息会加入暂停的队列…" : "有什么想一起理清的？"} canSubmit={canSend} disabled={!chat.ready || chat.unavailable} binding={props.detailBinding} onValueChange={chat.changeDraft} onSubmit={send} onNavigate={navigate} onCapture={() => setCapture(true)}
          footerStart={<ComposerAddMenu binding={props.detailBinding} onCapture={() => setCapture(true)} onNavigate={navigate}/>}
          footerEnd={<div className={styles.sendActions}>{active && <button type="button" className={styles.stop} aria-label="停止当前回复" title="停止当前回复，保留后续队列" disabled={chat.mutating || active.cancel_requested} onClick={() => void chat.mutate({kind:"stop",run_id:active.run_id!})}><Stop size={16} weight="fill"/><span>停止</span></button>}<button type="button" className={styles.send} aria-label={active || queued.length || paused ? "加入队列" : "发送消息"} title={active || paused ? "加入队列" : "发送"} disabled={!canSend} onClick={send}><ArrowUp size={21} weight="bold"/></button></div>}/>
      </div>
      {!hasContent && <div className={styles.starters} aria-label="开始一个话题">{["你可以帮我做什么？", "梳理今天需要跟进的人"].map(text => <button key={text} onClick={() => { chat.changeDraft(text); document.getElementById("queued-conversation-composer")?.focus(); }}>{text}<ArrowUp size={13} aria-hidden="true"/></button>)}</div>}
      <div className={styles.footer}><span role="status" aria-live="polite" aria-atomic="true">{status || ""}</span><span>Enter 发送 · Shift+Enter 换行</span></div>
    </div>
    {capture && <CapturePanel onClose={() => setCapture(false)} onCommitted={workspace => { if (isNewConversationId(workspace.subject.id) && isNewConversationId(workspace.assignment.id)) window.location.assign(newConversationCaptureHref(workspace.subject.id,workspace.assignment.id)); else setNotice("已保存，请从人物页面查看。"); }}/>}
  </section>;
}
