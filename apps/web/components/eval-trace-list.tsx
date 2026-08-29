"use client";

import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";
import type { TelemetryTraceListResponse } from "@talent-signal/contracts";
import Link from "next/link";
import { useMemo, useState } from "react";

import styles from "./eval-workbench.module.css";

type Trace = TelemetryTraceListResponse["traces"][number];

function duration(value: number | null): string {
  if (value === null) return "运行中";
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(1)} s`;
}

export function EvalTraceList({ traces }: { traces: Trace[] }) {
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState("all");
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return traces.filter((trace) => {
      const caseVerdict = trace.eval_case?.verdict ?? trace.status;
      if (verdict !== "all" && caseVerdict !== verdict) return false;
      if (!normalized) return true;
      return [
        trace.eval_case?.scenario,
        trace.eval_case?.provider,
        trace.eval_case?.modality,
        trace.name,
        trace.trace_id,
      ].some((value) => value?.toLowerCase().includes(normalized));
    });
  }, [query, traces, verdict]);

  return (
    <>
      <div className={styles.traceFilters}>
        <label>
          <MagnifyingGlass aria-hidden="true" size={16} />
          <span className={styles.srOnly}>搜索评估案例</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索场景、提供方或追踪 ID"
            type="search"
            value={query}
          />
        </label>
        <select
          aria-label="按判定结果筛选"
          onChange={(event) => setVerdict(event.target.value)}
          value={verdict}
        >
          <option value="all">全部判定结果</option>
          <option value="pass">满分完成</option>
          <option value="needs_review">需要审阅</option>
          <option value="fail">已阻止</option>
          <option value="ok">非案例执行通过</option>
        </select>
      </div>
      <div className={styles.traceList}>
        {visible.length === 0 ? (
          <p className={styles.empty}>此视图下没有匹配的评估案例。</p>
        ) : visible.map((trace) => {
          const status = trace.eval_case?.verdict ?? trace.status;
          return (
            <Link className={styles.traceRow} href={`/workspace/evals/${trace.trace_id}`} key={trace.trace_id}>
              <span className={styles.status} data-status={status}>{status}</span>
              <span className={styles.traceIdentity}>
                <strong>{trace.eval_case?.scenario ?? trace.name}</strong>
                <small>
                  {trace.eval_case
                    ? `${trace.eval_case.provider} · ${trace.eval_case.modality}`
                    : `${trace.trace_id.slice(0, 12)} · ${trace.content_capture_status}`}
                </small>
              </span>
              <span className={styles.traceMetric}>
                {trace.eval_case ? `${trace.eval_case.earned_points}/100` : `${trace.span_count} 个跨度`}
              </span>
              <span className={styles.traceMetric}>{duration(trace.duration_ms)}</span>
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          );
        })}
      </div>
    </>
  );
}
