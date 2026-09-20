"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationQueueMutationRequest, ConversationQueuePreview, ConversationQueueSnapshot } from "@talent-signal/contracts";
import type { SessionDetail } from "../session-workbench/session-detail-state";
import { workspaceSessionFetch } from "../workspace-session-request";
import { acceptConversationPreview, acceptConversationSnapshot, ConversationFrames } from "@/lib/conversation-stream";
import { clearConversationLocal, conversationExpiry, readConversationDraft, readConversationMessages, removeConversationMessage, writeConversationDraft, writeConversationMessage, type LocalMessage } from "@/lib/conversation-local";

type Options = { id: string | null; scope: string; chatBinding: string; detailBinding: string; initial?: SessionDetail; onAdmitted?: (id: string) => void };
class RequestError extends Error { constructor(message: string, readonly status: number, readonly code?: string) { super(message); } }
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
  const timer = setTimeout(finish, ms); signal.addEventListener("abort", finish, { once: true });
});

export function useConversation(options: Options) {
  const { id, scope, chatBinding, detailBinding, initial } = options;
  const [detail, setDetail] = useState(initial ?? null);
  const [draft, setDraft] = useState(initial?.composer_draft ?? "");
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [snapshot, setSnapshot] = useState<ConversationQueueSnapshot | null>(null);
  const [preview, setPreview] = useState<ConversationQueuePreview | null>(null);
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [serverExists, setServerExists] = useState(Boolean(initial));
  const [unavailable, setUnavailable] = useState(initial ? initial.state !== "active" : false);
  const [draftConflict, setDraftConflict] = useState(false);
  const [mutating, setMutating] = useState(false);
  const local = useRef(messages); const draftRef = useRef(draft); const detailRef = useRef(detail);
  const snapshotRef = useRef(snapshot); const lifecycle = useRef<AbortController | null>(null);
  const sender = useRef(false); const saving = useRef(false); const lastSaved = useRef(initial?.composer_draft ?? "");
  const mutationBusy = useRef(false); const pendingHandoff = useRef<string | null>(null);
  const writer = useRef(""); const draftStamp = useRef(""); const loaded = useRef(false);
  const admitted = useRef(options.onAdmitted);
  useEffect(() => { admitted.current = options.onAdmitted; }, [options.onAdmitted]);
  const expiry = () => conversationExpiry(detailRef.current?.expires_at);
  const queueUrl = `/api/workspace-sessions/${id}/conversation-queue`;

  const storeMessages = useCallback((next: LocalMessage[]) => { local.current = next; setMessages(next); }, []);
  const reconcile = useCallback((server: ConversationQueueSnapshot | null, history: SessionDetail | null) => {
    if (!id) return;
    const known = new Set([...(server?.queued ?? []).map(item => item.message_id), ...(server?.active ? [server.active.message_id] : []), ...(history?.turns ?? []).map(turn => turn.id)]);
    const remaining = local.current.filter(message => { if (!known.has(message.id)) return true; removeConversationMessage(scope, id, message.id); return false; });
    if (remaining.length !== local.current.length) storeMessages(remaining);
  }, [id, scope, storeMessages]);

  async function request(url: string, init: RequestInit = {}, binding = chatBinding) {
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted) throw new DOMException("Closed", "AbortError");
    const response = await workspaceSessionFetch(url, { ...init, cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      headers: { "x-workspace-session": binding, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new RequestError(body.message ?? "连接暂时中断，请重试。", response.status, body.code); }
    if (controller.signal.aborted) throw new DOMException("Closed", "AbortError");
    return response;
  }
  function applyDetail(next: SessionDetail) {
    if (next.session_id !== id || (detailRef.current && next.revision < detailRef.current.revision)) return;
    detailRef.current = next; setDetail(next); reconcile(snapshotRef.current, next);
    if (next.state !== "active") { clearConversationLocal(scope, id!); storeMessages([]); setPreview(null); setUnavailable(true); }
  }
  async function refreshDetail() {
    if (!id) return;
    const response = await request(`/api/workspace-sessions/${id}`, {}, detailBinding);
    const body = await response.json(); if (body.detail && !lifecycle.current?.signal.aborted) applyDetail(body.detail);
  }
  function refuse(error: unknown) {
    if (error instanceof RequestError && (error.status === 401 || error.status === 403 || error.status === 410 || error.code === "session_stale")) {
      setUnavailable(true); setPreview(null); setDetail(null); setDraft(""); storeMessages([]); if (id) clearConversationLocal(scope, id);
    }
  }
  function updateMessage(id: string, update: Partial<LocalMessage>) {
    storeMessages(local.current.map(message => { if (message.id !== id) return message; const next = { ...message, ...update }; writeConversationMessage(scope, options.id!, next); return next; }));
  }
  function handoffWhenSettled() {
    if (sender.current || mutationBusy.current || lifecycle.current?.signal.aborted || !pendingHandoff.current) return;
    const sessionId = pendingHandoff.current; pendingHandoff.current = null;
    admitted.current?.(sessionId);
  }
  async function drain() {
    if (sender.current || !id || !ready || unavailable) return;
    sender.current = true;
    const controller = lifecycle.current;
    let didAdmit = false;
    try {
      for (;;) {
        if (!controller || controller.signal.aborted) break;
        const message = local.current.find(item => item.delivery !== "accepted");
        if (!message || message.delivery !== "pending") break;
        updateMessage(message.id, { delivery: "sending", error: undefined });
        try {
          const response = await request(queueUrl, { method: "POST", body: JSON.stringify({ session_id: id, message_id: message.id, idempotency_key: `web-queue:${message.id}`, objective: message.objective, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
          await response.json();
          if (controller.signal.aborted) break;
          updateMessage(message.id, { delivery: "accepted" }); setServerExists(true); didAdmit = true;
        } catch (caught) {
          // No response is not a rejected message. Its immutable identity stays in the outbox.
          if (controller.signal.aborted) break;
          const definitive = caught instanceof RequestError && caught.status >= 400 && caught.status < 500 && caught.status !== 408;
          updateMessage(message.id, { delivery: definitive ? "rejected" : "unknown", error: definitive ? caught.message : "送达结果尚未确认，可核对并重试。" });
          if (!controller.signal.aborted) refuse(caught);
          break;
        }
      }
    } finally {
      sender.current = false;
      // Home-to-Session navigation unmounts this controller. Hand it off only
      // after serial admissions settle so it cannot abort the next send.
      if (didAdmit && !controller?.signal.aborted) { pendingHandoff.current = id; handoffWhenSettled(); }
    }
  }

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController(); lifecycle.current = controller; writer.current = crypto.randomUUID();
    queueMicrotask(() => {
    if (controller.signal.aborted) return;
    const recoveredDraft = readConversationDraft(scope, id);
    draftStamp.current = recoveredDraft?.updatedAt ?? "";
    const value = recoveredDraft?.value ?? initial?.composer_draft ?? "";
    draftRef.current = value; setDraft(value);
    storeMessages(readConversationMessages(scope, id).map(message => message.delivery === "sending" ? { ...message, delivery: "unknown" } : message));
    loaded.current = true; setReady(true);
    });
    function changed(event: StorageEvent) {
      if (!event.key?.startsWith(`talent-signal:conversation:v1:${scope}:${id}:`)) return;
      const other = readConversationDraft(scope, id!);
      if (other && other.writer !== writer.current && other.updatedAt > draftStamp.current && other.value !== draftRef.current) setDraftConflict(true);
      const found = readConversationMessages(scope, id!);
      const own = new Map(local.current.map(item => [item.id, item]));
      for (const message of found) if (!own.has(message.id)) own.set(message.id, { ...message, delivery: message.delivery === "pending" || message.delivery === "sending" ? "unknown" : message.delivery });
      storeMessages([...own.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    }
    window.addEventListener("storage", changed);
    return () => { loaded.current = false; controller.abort(); window.removeEventListener("storage", changed); };
    // The binding identifies this entire mounted conversation. Never migrate live state between accounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, scope, chatBinding, detailBinding]);

  useEffect(() => { if (ready) void drain(); /* Dispatch only messages that have never been attempted. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, messages]);

  useEffect(() => {
    if (!id || !ready || !serverExists || unavailable) return;
    const owner = lifecycle.current; if (!owner) return;
    const controller = new AbortController();
    const stop = () => controller.abort(); owner.signal.addEventListener("abort", stop, { once: true });
    const current = () => !controller.signal.aborted && !owner.signal.aborted;
    async function connect() {
      let failures = 0;
      while (current()) {
        try {
          const response = await workspaceSessionFetch(`${queueUrl}/stream`, { cache: "no-store", headers: { "x-workspace-session": chatBinding }, signal: controller.signal });
          if (!response.ok) { const body = await response.json().catch(() => ({})); throw new RequestError(body.message ?? "暂时无法连接回复。", response.status, body.code); }
          if (!response.body) throw new Error("没有可读取的回复连接。");
          failures = 0; setConnection("live");
          const reader = response.body.getReader(); const decoder = new TextDecoder(); const parser = new ConversationFrames();
          try {
            while (current()) {
              const chunk = await reader.read(); if (chunk.done) break;
              for (const frame of parser.push(decoder.decode(chunk.value, { stream: true }))) {
                if (!current()) break;
                if (frame.event === "snapshot") {
                  const next = acceptConversationSnapshot(snapshotRef.current, frame.data as ConversationQueueSnapshot, id!);
                  if (!next) continue;
                  snapshotRef.current = next; setSnapshot(next); reconcile(next, detailRef.current);
                  setPreview(previous => next.preview ? acceptConversationPreview(previous, next.preview, next) : previous?.run_id === next.active?.run_id ? previous : null);
                  void refreshDetail().catch(caught => { if (current()) refuse(caught); });
                } else if (frame.event === "preview") setPreview(previous => acceptConversationPreview(previous, frame.data as ConversationQueuePreview, snapshotRef.current));
                else if (frame.event === "unavailable") { setPreview(null); throw new RequestError("这段对话已不可用，请重新打开。", 410); }
              }
            }
          } finally { await reader.cancel().catch(() => {}); }
        } catch (caught) {
          if (!current()) break;
          if (caught instanceof RequestError && [401, 403, 409, 410].includes(caught.status)) { refuse(caught); setError(caught.message); break; }
          failures++;
        }
        if (!current()) break;
        setConnection("reconnecting"); await sleep(Math.min(1000 * 2 ** failures, 10000), controller.signal);
      }
    }
    void connect();
    return () => { controller.abort(); owner.signal.removeEventListener("abort", stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, scope, chatBinding, ready, serverExists, unavailable]);

  function changeDraft(value: string) {
    draftRef.current = value; setDraft(value);
    if (!id) return;
    const existing = readConversationDraft(scope, id);
    if (existing && existing.writer !== writer.current && existing.updatedAt > draftStamp.current && existing.value !== value) { setDraftConflict(true); return; }
    const updatedAt = new Date().toISOString();
    if (!writeConversationDraft(scope, id, { value, updatedAt, expiresAt: expiry(), writer: writer.current })) setError("本机草稿存储不可用，请保留此页。发送前需要恢复存储。");
    else draftStamp.current = updatedAt;
  }
  function submit() {
    const objective = draftRef.current.trim();
    if (!ready || !id || unavailable || !objective || objective.length > 1000 || local.current.length + (snapshotRef.current?.queued.length ?? 0) + (snapshotRef.current?.active ? 1 : 0) >= 50) return false;
    const lastCreated = local.current.at(-1)?.createdAt;
    const message: LocalMessage = { id: crypto.randomUUID(), objective, createdAt: new Date(Math.max(Date.now(), lastCreated ? Date.parse(lastCreated) + 1 : 0)).toISOString(), delivery: "pending", expiresAt: expiry() };
    if (!writeConversationMessage(scope, id, message)) { setError("无法保存发送状态，内容仍在输入框中。请恢复浏览器存储后重试。"); return false; }
    const stamp = new Date().toISOString();
    if (!writeConversationDraft(scope, id, { value: "", updatedAt: stamp, expiresAt: expiry(), writer: writer.current })) { removeConversationMessage(scope, id, message.id); setError("草稿无法安全更新，内容已保留。请恢复浏览器存储后重试。"); return false; }
    draftStamp.current = stamp; draftRef.current = ""; setDraft(""); storeMessages([...local.current, message]); setError(""); return true;
  }
  async function retryDelivery(message: LocalMessage) {
    // First reconcile a lost receipt. Only an explicit retry can repeat its stable admission.
    try { const response = await request(queueUrl); const next = await response.json() as ConversationQueueSnapshot; snapshotRef.current = next; setSnapshot(next); await refreshDetail(); reconcile(next, detailRef.current); }
    catch (caught) { if (caught instanceof RequestError && caught.status !== 404) { refuse(caught); if ([401, 403, 410].includes(caught.status)) return; } }
    if (local.current.some(item => item.id === message.id)) updateMessage(message.id, { delivery: "pending", error: undefined });
  }
  function discardRejectedDelivery(messageId: string) {
    if (!id || !local.current.some(message => message.id === messageId && message.delivery === "rejected")) return;
    // An unknown receipt must be reconciled; only a definitive rejection can
    // be removed locally without risking an invisible accepted intention.
    removeConversationMessage(scope, id, messageId);
    storeMessages(local.current.filter(message => message.id !== messageId));
  }
  async function mutate(input: Omit<ConversationQueueMutationRequest, "expected_revision" | "idempotency_key"> & { objective?: string; queue_entry_id?: string; run_id?: string }) {
    if (mutationBusy.current || !snapshotRef.current) return false;
    mutationBusy.current = true; setMutating(true); setError("");
    try {
      const operation = crypto.randomUUID();
      let response: Response;
      try { response = await request(`${queueUrl}/mutations`, { method: "POST", body: JSON.stringify({ ...input, expected_revision: snapshotRef.current.revision, idempotency_key: operation }) }); }
      catch (caught) {
        // A concurrent admission may advance the queue while Stop is in flight.
        // Rebase only a rejected CAS and only while the same run still owns it.
        if (input.kind !== "stop" || !(caught instanceof RequestError) || caught.status !== 409) throw caught;
        const latest = await (await request(queueUrl)).json() as ConversationQueueSnapshot;
        snapshotRef.current = latest; setSnapshot(latest);
        if (latest.active?.run_id !== input.run_id) return true;
        response = await request(`${queueUrl}/mutations`, { method: "POST", body: JSON.stringify({ ...input, expected_revision: latest.revision, idempotency_key: operation }) });
      }
      const body = await response.json(); snapshotRef.current = body.snapshot; setSnapshot(body.snapshot); reconcile(body.snapshot, detailRef.current); return true;
    } catch (caught) {
      refuse(caught); setError(caught instanceof RequestError && caught.status === 409 ? "队列刚刚有变化，已更新。请核对后再操作。" : "操作结果尚未确认，已保留内容。请核对队列后重试。");
      try { const response = await request(queueUrl); const next = await response.json(); snapshotRef.current = next; setSnapshot(next); } catch { /* Keep the last known state. */ }
      return false;
    } finally { mutationBusy.current = false; if (!lifecycle.current?.signal.aborted) { setMutating(false); handoffWhenSettled(); } }
  }

  async function saveDraft(force = false) {
    if (!id || !serverExists || saving.current || unavailable || (!force && draftConflict) || draftRef.current === lastSaved.current || !detailRef.current) return;
    saving.current = true;
    const value = draftRef.current; const base = lastSaved.current;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await request(`/api/workspace-sessions/${id}`, { method: "PUT", body: JSON.stringify({ expected_revision: detailRef.current!.revision, idempotency_key: crypto.randomUUID(), composer_draft: value, composer_draft_updated_at: new Date().toISOString() }) }, detailBinding);
          const body = await response.json(); lastSaved.current = value; applyDetail(body.detail); return;
        } catch (caught) {
          if (!(caught instanceof RequestError) || caught.status !== 409) throw caught;
          await refreshDetail();
          if ((detailRef.current?.composer_draft ?? "") !== base && !force) { setDraftConflict(true); return; }
        }
      }
    } catch (caught) { refuse(caught); /* The local draft remains durable; background retries never erase it. */ }
    finally { saving.current = false; }
  }
  useEffect(() => { if (!ready || !serverExists) return; const timer = setTimeout(() => { void saveDraft(); }, 750); return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, ready, serverExists, detail?.revision]);
  async function keepDraft() { setDraftConflict(false); if (id) { const updatedAt = new Date().toISOString(); writeConversationDraft(scope, id, { value: draftRef.current, updatedAt, writer: writer.current, expiresAt: expiry() }); draftStamp.current = updatedAt; } await saveDraft(true); }
  async function remove() {
    if (!detailRef.current || !id) return false;
    try { const response = await request(`/api/workspace-sessions/${id}`, { method: "DELETE", body: JSON.stringify({ expected_revision: detailRef.current.revision, idempotency_key: crypto.randomUUID() }) }, detailBinding); const body = await response.json(); applyDetail(body.detail); return true; }
    catch (caught) { setError(caught instanceof Error ? caught.message : "删除尚未确认，请重试。"); await refreshDetail().catch(() => {}); return false; }
  }
  return { detail, draft, messages, snapshot, preview, connection, error, ready, unavailable, draftConflict, mutating, changeDraft, submit, retryDelivery, discardRejectedDelivery, mutate, keepDraft, remove, refreshDetail };
}
