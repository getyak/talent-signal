"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentPreferenceMutation, AgentPreferenceResponse } from "@talent-signal/contracts";
import styles from "./agent-review-form.module.css";

async function preferenceRequest(sessionVersion: string, input?: AgentPreferenceMutation): Promise<AgentPreferenceResponse> {
  const result = await fetch("/api/agent-preferences", { method: input ? "PUT" : "GET", cache: "no-store",
    headers: { "x-workspace-session": sessionVersion, ...(input ? { "content-type": "application/json" } : {}) },
    ...(input ? { body: JSON.stringify(input) } : {}) });
  const body = await result.json();
  if (!result.ok) throw new Error(body.message ?? "暂时无法读取回复偏好。");
  return body;
}
export function AgentResponsePreference({ sessionVersion }: { sessionVersion: string }) {
  const [current, setCurrent] = useState<AgentPreferenceResponse["preference"] | null>(null);
  const [style, setStyle] = useState<AgentPreferenceMutation["response_style"]>("default");
  const [busy, setBusy] = useState(true), [message, setMessage] = useState(""), [error, setError] = useState("");
  const attempt = useRef<AgentPreferenceMutation | null>(null);
  useEffect(() => {
    let active = true;
    preferenceRequest(sessionVersion).then(result => { if (active) { setCurrent(result.preference); setStyle(result.preference.response_style); } })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [sessionVersion]);
  async function reload() {
    setBusy(true); setError(""); setMessage("");
    try { const result = await preferenceRequest(sessionVersion); setCurrent(result.preference); setStyle(result.preference.response_style); attempt.current = null; }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    if (!current) return;
    setBusy(true); setError(""); setMessage("");
    try {
      attempt.current ??= { idempotency_key: crypto.randomUUID(), expected_revision: current.revision, response_style: style };
      const saved = await preferenceRequest(sessionVersion, attempt.current);
      const readback = await preferenceRequest(sessionVersion);
      if (readback.preference.revision !== saved.preference.revision || readback.preference.response_style !== saved.preference.response_style) throw new Error("偏好已在另一端改变，请重新读取。");
      setCurrent(readback.preference); attempt.current = null; setMessage("已保存，新对话会使用这个偏好。");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className={styles.preference} aria-labelledby="reply-preference-title">
    <h1 id="reply-preference-title">回复偏好</h1>
    <p>这是你为自己保存的偏好，会同步到 Web 和 iOS。当前消息中的要求优先。</p>
    <label className={styles.field} htmlFor="reply-preference-style">回复顺序
    <select id="reply-preference-style" value={style} disabled={busy || !current} onChange={e => { setStyle(e.target.value as typeof style); attempt.current = null; setMessage(""); }}>
      <option value="default">按当前问题安排</option><option value="conclusion_first">先给结论，再展开说明</option>
    </select></label>
    <p>只改变回复方式，不改变来源判断或操作权限。选择“按当前问题安排”可以重置。</p>
    <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={busy || !current || style === current.response_style} onClick={save}>{busy ? "正在核对…" : "保存偏好"}</button>
      <button type="button" className={styles.secondary} disabled={busy} onClick={reload}>重新读取</button>
    </div>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
