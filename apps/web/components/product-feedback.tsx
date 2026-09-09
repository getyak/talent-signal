"use client";
import { useEffect, useRef, useState } from "react";
import { ThumbsUp, ThumbsDown, Check, ArrowClockwise } from "@phosphor-icons/react";
import type { ProductRunDetail, ProductRunFeedbackMutation } from "@talent-signal/contracts";
import styles from "./product-feedback.module.css";

export const reasonLabels: Record<string, string> = {
  new_insight: "想到了我没想到的", remembered_context: "记住了关键背景", clear_next_step: "让我知道下一步", ready_to_use: "可以直接用",
  wrong_intent: "理解错我的意思", wrong_memory: "记错或漏掉背景", incorrect_information: "信息不对或过时", not_actionable: "建议用不上", poor_expression: "表达不合适",
};
const reasons = { helpful: Object.keys(reasonLabels).slice(0, 4), unhelpful: Object.keys(reasonLabels).slice(4) };
async function load(taskID: string): Promise<ProductRunDetail> {
  const response = await fetch(`/api/product-runs/tasks/${taskID}`, { cache: "no-store" });
  const value = await response.json(); if (!response.ok) throw new Error(value.message); return value;
}
export function ProductFeedback({ taskID, onCorrect }: { taskID: string; onCorrect?: (correction: string) => void }) {
  const [detail, setDetail] = useState<ProductRunDetail | null>(null);
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [comment, setComment] = useState(""), [correction, setCorrection] = useState("");
  const [passage, setPassage] = useState("");
  const mutationVersion = useRef(0), saving = useRef(false);
  const pending = useRef<ProductRunFeedbackMutation | null>(null);
  const feedback = detail?.run.feedback;
  useEffect(() => {
    let valid = true; const version = mutationVersion.current;
    load(taskID).then(value => { if (valid && version === mutationVersion.current) { setDetail(value); setSelected(value.run.feedback.reasons);
      setComment(value.run.feedback.comment); setCorrection(value.run.feedback.correction); setPassage(value.run.feedback.selected_text); } }).catch(() => {});
    return () => { valid = false; };
  }, [taskID]);
  async function save(sentiment: "helpful" | "unhelpful" | null, notes = false, retry = false) {
    if (saving.current) return false; saving.current = true; mutationVersion.current++; setBusy(true); setError("");
    try {
      const source = detail ?? await load(taskID);
      if (!source.run.output_hash) throw new Error("回答尚未完成，请稍后重试。");
      const request = retry && pending.current ? pending.current : {
        idempotency_key: crypto.randomUUID(), expected_revision: source.run.feedback.revision, output_hash: source.run.output_hash,
        sentiment, reasons: sentiment && notes ? selected : [], comment: sentiment && notes ? comment : "",
        correction: sentiment && notes ? correction : "", selected_text: sentiment && notes ? passage : "",
      };
      pending.current = request;
      const response = await fetch(`/api/product-runs/tasks/${taskID}/feedback`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
      const value = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          const fresh = await load(taskID); setDetail(fresh);
          pending.current = { ...request, idempotency_key: crypto.randomUUID(), expected_revision: fresh.run.feedback.revision,
            output_hash: fresh.run.output_hash ?? request.output_hash };
          throw new Error("回答或反馈已更新。核对当前回答后，重试会保留你刚才的评价。");
        }
        throw new Error(value.message ?? "反馈未保存，请重试。");
      }
      setDetail(value); pending.current = null;
      if (!notes) { setSelected([]); setComment(""); setCorrection(""); setExpanded(sentiment === "unhelpful"); }
      if (notes) setExpanded(false);
      return true;
    } catch (caught) { setError((caught as Error).message); return false; }
    finally { saving.current = false; setBusy(false); }
  }
  return <div className={styles.root} aria-label="回答反馈">
    <div className={styles.actions}>
      <button type="button" title="有帮助" aria-label="有帮助" aria-pressed={feedback?.sentiment === "helpful"} disabled={busy}
        onClick={() => void save(feedback?.sentiment === "helpful" ? null : "helpful")}><ThumbsUp size={18} weight={feedback?.sentiment === "helpful" ? "fill" : "regular"} /></button>
      <button type="button" title="没帮上" aria-label="没帮上" aria-pressed={feedback?.sentiment === "unhelpful"} disabled={busy}
        onClick={() => void save(feedback?.sentiment === "unhelpful" ? null : "unhelpful")}><ThumbsDown size={18} weight={feedback?.sentiment === "unhelpful" ? "fill" : "regular"} /></button>
      <span role="status">{busy ? "正在保存…" : feedback?.sentiment ? <><Check size={13} /> 已记录</> : null}</span>
      {feedback?.sentiment && <button className={styles.textButton} aria-expanded={expanded} onClick={() => { setPassage(window.getSelection()?.toString().slice(0, 4000) ?? ""); setExpanded(!expanded); }}>
        {feedback.sentiment === "helpful" ? "哪一点最有帮助？" : "补充原因"}<small>可选</small></button>}
    </div>
    {error && <div className={styles.error} role="alert">{error}<button onClick={() => void save(feedback?.sentiment ?? null, false, true)} disabled={busy}><ArrowClockwise /> 重试</button></div>}
    {expanded && feedback?.sentiment && <div className={styles.details}>
      <div className={styles.heading}><strong>{feedback.sentiment === "helpful" ? "哪一点让你觉得特别有用？" : "怎样才能更有帮助？"}</strong><button onClick={() => setExpanded(false)}>暂不补充</button></div>
      {passage && <blockquote>{passage}</blockquote>}
      <div className={styles.reasons}>{reasons[feedback.sentiment].map(reason => <button key={reason} aria-pressed={selected.includes(reason)}
        onClick={() => setSelected(current => current.includes(reason) ? current.filter(item => item !== reason) : [...current, reason])}>{reasonLabels[reason]}</button>)}</div>
      <label>补充说明<textarea maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} placeholder={feedback.sentiment === "helpful" ? "哪句话或哪个发现帮到了你？" : "可以直接说哪里没帮上，不必解释技术原因。"} /></label>
      {feedback.sentiment === "unhelpful" && <label>你希望怎样回答<textarea maxLength={900} value={correction} onChange={event => setCorrection(event.target.value)} placeholder="例如：时间还没确定，请先列出需要确认的问题。" /></label>}
      <div className={styles.footer}><span>刚才的评价已经保存</span><button onClick={() => void save(feedback.sentiment, true)} disabled={busy}>保存补充</button>
        {correction.trim() && onCorrect && <button onClick={async () => { if (await save(feedback.sentiment, true)) onCorrect(correction); }} disabled={busy}>按此修改</button>}</div>
    </div>}
  </div>;
}
