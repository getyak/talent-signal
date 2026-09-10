"use client";
import { useEffect, useRef, useState } from "react";
import type { UnscopedChatTaskResponse } from "@talent-signal/contracts";
import { relationshipIntegrationFetch } from "@/components/workspace-session-request";

export type WorkspaceChatTurn = { objective: string; response: UnscopedChatTaskResponse };
export function useWorkspaceChat(accountId: string | null, sessionVersion: string | null, enabled: boolean, onError: (message: string) => void) {
  const binding = accountId && sessionVersion ? `${accountId}:${sessionVersion}` : null;
  const [state, setState] = useState<{ binding: string | null; turns: WorkspaceChatTurn[]; busy: boolean }>({ binding, turns: [], busy: false });
  const active = useRef<{ accountId: string; sessionID: string; pending?: { objective: string; requestID: string }; controller?: AbortController } | null>(null);
  useEffect(() => { active.current?.controller?.abort(); active.current = null; return () => { active.current?.controller?.abort(); }; }, [binding]);
  useEffect(() => { if (!enabled) active.current?.controller?.abort(); }, [enabled]);
  async function ask(objective: string) {
    if (!accountId || !sessionVersion || !binding) { onError("当前账号尚未就绪，请重新打开工作台。"); return; }
    if (!enabled || active.current?.controller) return;
    if (active.current?.accountId !== accountId) active.current = { accountId, sessionID: crypto.randomUUID() };
    const run = active.current;
    if (!run.pending || run.pending.objective !== objective) run.pending = { objective, requestID: crypto.randomUUID() };
    const pending = run.pending;
    const controller = new AbortController(); run.controller = controller;
    setState(current => ({ binding, turns: current.binding === binding ? current.turns : [], busy: true }));
    onError("");
    try {
      const result = await relationshipIntegrationFetch("/api/workspace-chat", { method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-workspace-session": sessionVersion }, body: JSON.stringify({ request_id: pending.requestID,
          session_id: run.sessionID, objective, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      const response = await result.json() as UnscopedChatTaskResponse & { message?: string };
      if (!result.ok || !Array.isArray(response.blocks)) throw new Error(response.message || "本次回复未完成，可以重试。");
      if (controller.signal.aborted || active.current !== run) return;
      run.pending = undefined;
      setState(current => ({ binding, busy: false, turns: [...(current.binding === binding ? current.turns : []), { objective, response }] }));
      return true;
    } catch (error) { if (!controller.signal.aborted && active.current === run) onError(error instanceof Error ? error.message : "本次回复未完成，可以重试。"); }
    finally { if (active.current === run) { run.controller = undefined; setState(current => ({ ...current, busy: false })); } }
  }
  return { ask, turns: state.binding === binding ? state.turns : [], busy: state.binding === binding && state.busy };
}
