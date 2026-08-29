"use client";

import { CheckCircle, FileArrowUp, SpinnerGap } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  appendWebTrace,
  beginWebTrace,
  completeWebTrace,
  traceSpanId,
} from "@/lib/telemetry";

import styles from "./eval-workbench.module.css";

export function EvalTraceCapture() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() && files.length === 0) return;
    setSubmitting(true);
    setError(null);
    setReceipt(null);
    try {
      const startedAt = new Date().toISOString();
      const trace = await beginWebTrace({
        name: "evaluation.capture",
        route: "/workspace/evals",
        ...(text.trim() ? { text: text.trim() } : {}),
        files,
        dataClassification: "synthetic",
        authorizationScope: "evaluation:manual-capture",
        attributes: {
          "ts.ui.event": "evaluation_capture_submitted",
          "ts.content.part_count": files.length + (text.trim() ? 1 : 0),
          "ts.content.file_count": files.length,
        },
      });
      const endedAt = new Date().toISOString();
      await appendWebTrace(trace, {
        spans: [
          {
            span_id: traceSpanId(trace, "manual-capture"),
            parent_span_id: trace.root_span_id,
            name: "ui.capture governed_eval_artifacts",
            kind: "internal",
            status: "ok",
            started_at: startedAt,
            ended_at: endedAt,
            attributes: {
              "ts.content.artifact_count": trace.artifact_ids.length,
              "ts.capture.mode": "manual_synthetic",
            },
            artifact_refs: trace.artifact_ids,
            agent_run_id: null,
            agent_event_sequence: null,
          },
        ],
        events: [
          {
            event_id: crypto.randomUUID(),
            span_id: trace.root_span_id,
            name: "attachment_upload_completed",
            occurred_at: endedAt,
            attributes: {
              "ts.content.artifact_count": trace.artifact_ids.length,
            },
            artifact_refs: trace.artifact_ids,
          },
        ],
      });
      await completeWebTrace(trace, {
        status: "ok",
        attributes: { "ts.capture.receipt": "verified" },
      });
      setReceipt(trace.trace_id);
      setText("");
      setFiles([]);
      const input = document.getElementById("eval-trace-files") as HTMLInputElement | null;
      if (input) input.value = "";
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "采集失败。")
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.capture} onSubmit={submit}>
      <div>
        <p className={styles.eyebrow}>实时采集探针</p>
        <h2>采集一次合成交互</h2>
        <p>
          文字、文件与图片会作为账号范围内的受治理制品存储。追踪索引只接收 ID、哈希、大小与生命周期元数据。
        </p>
      </div>
      <label>
        <span>文字或提示词</span>
        <textarea
          maxLength={100_000}
          onChange={(event) => setText(event.target.value)}
          placeholder="粘贴合成消息、提示词或预期输出……"
          rows={4}
          value={text}
        />
      </label>
      <label className={styles.filePicker}>
        <FileArrowUp aria-hidden="true" size={20} />
        <span>
          <strong>添加文件或图片</strong>
          <small>每个最大 5 MB · 存储 30 天</small>
        </span>
        <input
          id="eval-trace-files"
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          type="file"
        />
      </label>
      {files.length > 0 ? (
        <ul className={styles.fileList}>
          {files.map((file, index) => (
            <li key={`${file.name}:${file.size}:${index}`}>
              <span>{file.type || "application/octet-stream"}</span>
              <strong>{Math.ceil(file.size / 1024)} KB</strong>
            </li>
          ))}
        </ul>
      ) : null}
      <button disabled={submitting || (!text.trim() && files.length === 0)} type="submit">
        {submitting ? <SpinnerGap aria-hidden="true" className={styles.spin} size={18} /> : null}
        {submitting ? "正在写入受治理追踪……" : "采集并验证"}
      </button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {receipt ? (
        <p className={styles.receipt}>
          <CheckCircle aria-hidden="true" size={18} weight="fill" />
          追踪 {receipt.slice(0, 12)} 已可在下方查询。
        </p>
      ) : null}
    </form>
  );
}
