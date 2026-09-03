import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import styles from "@/components/eval-workbench.module.css";
import { loadTelemetryTrace } from "@/lib/server/telemetryBackend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "追踪详情",
  robots: { follow: false, index: false },
};

const TRACE_ID = /^[0-9a-f]{32}$/;

function pretty(attributes: Record<string, string | number | boolean | null>) {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" · ");
}

type TraceSpan = Awaited<ReturnType<typeof loadTelemetryTrace>>["trace"]["spans"][number];

const CRITICAL_CRITERIA = [
  ["case_input_capability", "输入能力覆盖"],
  ["case_terminal_semantic", "终止与语义结果"],
  ["case_tool_policy", "受治理工具政策"],
  ["case_evidence_lineage", "依据谱系"],
  ["case_external_effect_boundary", "外部效果边界"],
] as const;

const CRITICAL_NAMES: ReadonlySet<string> = new Set(
  CRITICAL_CRITERIA.map(([name]) => name),
);

function criterionLabel(name: string): string {
  return CRITICAL_CRITERIA.find(([key]) => key === name)?.[1] ?? name;
}

function verdictLabel(value: string): string {
  if (value === "pass") return "满分完成";
  if (value === "fail") return "已阻止";
  if (value === "needs_review") return "需要审阅";
  return value;
}

function causalOrder(spans: TraceSpan[], rootSpanId: string): TraceSpan[] {
  const children = new Map<string | null, TraceSpan[]>();
  for (const span of spans) {
    const grouped = children.get(span.parent_span_id) ?? [];
    grouped.push(span);
    children.set(span.parent_span_id, grouped);
  }
  for (const grouped of children.values()) {
    grouped.sort(
      (left, right) =>
        (left.agent_event_sequence ?? -1) - (right.agent_event_sequence ?? -1) ||
        Date.parse(left.started_at) - Date.parse(right.started_at) ||
        left.span_id.localeCompare(right.span_id),
    );
  }
  const ordered: TraceSpan[] = [];
  const visited = new Set<string>();
  const visit = (span: TraceSpan) => {
    if (visited.has(span.span_id)) return;
    visited.add(span.span_id);
    ordered.push(span);
    for (const child of children.get(span.span_id) ?? []) visit(child);
  };
  const root = spans.find((span) => span.span_id === rootSpanId);
  if (root) visit(root);
  for (const span of spans) visit(span);
  return ordered;
}

export default async function EvalTraceDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  if (!(await auth())?.user) redirect("/login?callbackUrl=%2Fworkspace%2Fevals");
  const { traceId } = await params;
  if (!TRACE_ID.test(traceId)) notFound();
  let detail: Awaited<ReturnType<typeof loadTelemetryTrace>>;
  try {
    detail = await loadTelemetryTrace(traceId);
  } catch {
    notFound();
  }
  const trace = detail.trace;
  const spans = causalOrder(trace.spans, trace.root_span_id);
  const agentSpan = trace.spans.find((span) => span.name.startsWith("agent.invoke"));
  const toolSpans = trace.spans
    .filter((span) => typeof span.attributes["gen_ai.tool.name"] === "string")
    .sort(
      (left, right) =>
        (left.agent_event_sequence ?? 0) - (right.agent_event_sequence ?? 0),
    );
  const criticalEvaluations = trace.evaluations
    .filter((evaluation) => CRITICAL_NAMES.has(evaluation.evaluator_name))
    .sort(
      (left, right) =>
        CRITICAL_CRITERIA.findIndex(([name]) => name === left.evaluator_name) -
        CRITICAL_CRITERIA.findIndex(([name]) => name === right.evaluator_name),
    );
  const blockingEvaluations = criticalEvaluations.filter(
    (evaluation) => evaluation.verdict !== "pass",
  );
  const evalCase = trace.eval_case;
  const overallVerdict = evalCase?.verdict ??
    (trace.status === "ok" ? "needs_review" : "fail");
  const earnedPoints = evalCase?.earned_points ??
    criticalEvaluations.filter((evaluation) => evaluation.verdict === "pass").length * 20;
  const expectedTerminal = String(
    trace.attributes["ts.eval.expected_terminal"] ?? "未冻结",
  );
  const expectedReason = String(
    trace.attributes["ts.eval.expected_semantic_reason"] ?? "未冻结",
  );
  const expectedTools = String(
    trace.attributes["ts.eval.expected_tool_sequence"] ?? "未冻结",
  ).replaceAll(",", " → ");
  const observedTerminal = String(
    agentSpan?.attributes["ts.agent.status"] ?? trace.status,
  );
  const semanticEvaluation = criticalEvaluations.find(
    (evaluation) => evaluation.evaluator_name === "case_terminal_semantic",
  );
  const nextTest = blockingEvaluations[0]
    ? `解决“${criterionLabel(blockingEvaluations[0].evaluator_name)}”，然后重新运行同一个冻结案例。`
    : "比较其他运行前，先冻结新的案例或模型提供方版本。";
  return (
    <main className={styles.page} id="main-content" tabIndex={-1}>
      <Link className={styles.backLink} href="/workspace/evals">
        <ArrowLeft aria-hidden="true" size={16} /> 最近追踪
      </Link>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>评估案例 · 追踪 {trace.trace_id.slice(0, 12)}</p>
          <h1>{evalCase?.scenario ?? trace.name}</h1>
          <p>
            {evalCase
              ? `${evalCase.provider} · ${evalCase.modality} · ${trace.content_capture_status}`
              : `${trace.route} · ${trace.data_classification} · ${trace.content_capture_status}`}
          </p>
        </div>
        <span className={styles.status} data-status={overallVerdict}>
          {overallVerdict}
        </span>
      </header>
      <div className={styles.detailLayout}>
        <section className={`${styles.detailCard} ${styles.verdictCard}`}>
          <div className={styles.verdictHero}>
            <div>
              <p className={styles.eyebrow}>评估案例 v1 完成标准</p>
              <h2>{verdictLabel(overallVerdict)}</h2>
              <p>
                只有五个 20 分关键门槛全部通过，案例才能达到 100 分。失败或审阅缺口绝不会被平均分掩盖。
              </p>
            </div>
            <strong className={styles.score}>{earnedPoints}<small>/100</small></strong>
          </div>
          <div className={styles.decisionFlow}>
            <div><small>预期</small><strong>{expectedTerminal} · {expectedReason}</strong><span>{expectedTools}</span></div>
            <div><small>观察到</small><strong>{observedTerminal}</strong><span>{semanticEvaluation?.explanation ?? "没有原子语义回执。"}</span></div>
            <div><small>决定</small><strong>{verdictLabel(overallVerdict)}</strong><span>{blockingEvaluations.length === 0 ? "所有关键门槛均已通过。" : `${blockingEvaluations.length} 个关键门槛阻止完成。`}</span></div>
            <div><small>下一项测试</small><strong>{blockingEvaluations.length === 0 ? "为下一案例建立版本" : "更正后重新运行"}</strong><span>{nextTest}</span></div>
          </div>
          {blockingEvaluations.length > 0 ? (
            <div className={styles.blockingList}>
              <h3>阻断条件</h3>
              {blockingEvaluations.map((evaluation) => (
                <article className={styles.criterion} key={evaluation.id}>
                  <span className={styles.status} data-status={evaluation.verdict}>{evaluation.verdict}</span>
                  <div><strong>{criterionLabel(evaluation.evaluator_name)}</strong><p>{evaluation.explanation}</p></div>
                  <b>20 分</b>
                </article>
              ))}
            </div>
          ) : null}
          <details className={styles.inlineDetails}>
            <summary>评分规则与全部五个门槛</summary>
            <div className={styles.criterionList}>
              {criticalEvaluations.map((evaluation) => (
                <article className={styles.criterion} key={evaluation.id}>
                  <span className={styles.status} data-status={evaluation.verdict}>{evaluation.verdict}</span>
                  <div><strong>{criterionLabel(evaluation.evaluator_name)}</strong><p>{evaluation.explanation}</p></div>
                  <b>{evaluation.verdict === "pass" ? 20 : 0}/20</b>
                </article>
              ))}
              {criticalEvaluations.length === 0 ? <p>没有可用的版本化关键门槛回执。</p> : null}
            </div>
          </details>
        </section>

        <details className={styles.detailCard}>
          <summary className={styles.detailsSummary}>执行与智能助理回执</summary>
          <div className={styles.summaryGrid}>
            <div><small>执行</small><strong>{trace.status}</strong></div>
            <div><small>跨度</small><strong>{trace.span_count}</strong></div>
            <div><small>制品</small><strong>{trace.artifact_count}</strong></div>
            <div><small>错误</small><strong>{trace.error_count}</strong></div>
          </div>
          {agentSpan ? (
            <>
              <div className={styles.agentSummary}>
                <div><small>提供方</small><strong>{String(agentSpan.attributes["gen_ai.provider.name"] ?? "unknown")}</strong></div>
                <div><small>模型</small><strong>{String(agentSpan.attributes["gen_ai.request.model"] ?? "unknown")}</strong></div>
                <div><small>终止状态</small><strong>{observedTerminal}</strong></div>
                <div><small>工具调用</small><strong>{String(agentSpan.attributes["ts.agent.tool_calls"] ?? toolSpans.length)}</strong></div>
                <div><small>输入制品</small><strong>{String(agentSpan.attributes["ts.input.artifact_count"] ?? agentSpan.artifact_refs.length)}</strong></div>
                <div><small>推理</small><strong>未收集隐藏思维链</strong></div>
              </div>
              <p className={styles.receiptNote}>Run {agentSpan.agent_run_id?.slice(0, 12)} · policy {String(agentSpan.attributes["ts.policy.version"] ?? "unknown")} · context {String(agentSpan.attributes["ts.context.fingerprint"] ?? "unknown").slice(0, 12)}</p>
            </>
          ) : null}
        </details>

        <details className={styles.detailCard}>
          <summary className={styles.detailsSummary}>受治理工具序列</summary>
          {toolSpans.length === 0 ? (
            <p>没有可用的关联智能助理工具调用。</p>
          ) : (
            <div className={styles.toolTable}>
              {toolSpans.map((span) => (
                <article key={span.span_id}>
                  <span>{span.agent_event_sequence ?? "—"}</span>
                  <strong>{String(span.attributes["gen_ai.tool.name"])}</strong>
                  <small>{String(span.attributes["ts.agent.event.status"] ?? span.status)}</small>
                  <code>{String(span.attributes["ts.input.fingerprint"] ?? "").slice(0, 12)}</code>
                  <span className={styles.status} data-status={span.status}>{span.status}</span>
                </article>
              ))}
            </div>
          )}
        </details>

        <details className={styles.detailCard}>
          <summary className={styles.detailsSummary}>受治理制品</summary>
          <div className={styles.artifactGrid}>
            {trace.artifacts.map((artifact) => (
              <article className={styles.artifact} key={artifact.id}>
                <header>
                  <strong>{artifact.kind}</strong>
                  <span className={styles.artifactMeta}>{Math.ceil(artifact.byte_size / 1024)} KB</span>
                </header>
                <p>{artifact.mime_type} · {artifact.capture_status} · hash {artifact.content_hash.slice(0, 12)}</p>
                {artifact.preview_text ? <pre>{artifact.preview_text}</pre> : null}
                {artifact.kind === "image" && artifact.deletion_state === "active" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="受治理评估制品预览" src={`/api/eval/artifacts/${artifact.id}/content`} />
                ) : artifact.deletion_state === "active" && !artifact.preview_text ? (
                  <p><Link href={`/api/eval/artifacts/${artifact.id}/content`}>打开受治理内容</Link></p>
                ) : null}
              </article>
            ))}
          </div>
        </details>

        <details className={styles.detailCard}>
          <summary className={styles.detailsSummary}>原始追踪依据</summary>
          <h3>全部评估</h3>
          <div className={styles.eventList}>
            {trace.evaluations.map((evaluation) => (
              <article className={styles.event} key={evaluation.id}>
                <header><strong>{evaluation.evaluator_name}</strong><span className={styles.status} data-status={evaluation.verdict}>{evaluation.verdict}</span></header>
                <p>{evaluation.explanation}</p>
              </article>
            ))}
          </div>
          <h3>跨度</h3>
          <div className={styles.timeline}>
            {spans.map((span) => (
              <article className={styles.span} key={span.span_id}>
                <header><strong>{span.name}</strong><span className={styles.status} data-status={span.status}>{span.status}</span></header>
                <p>{span.agent_event_sequence ? `#${span.agent_event_sequence} · ` : ""}{span.kind} · {span.span_id} · parent {span.parent_span_id ?? "root"}</p>
                {Object.keys(span.attributes).length > 0 ? <p>{pretty(span.attributes)}</p> : null}
              </article>
            ))}
          </div>
          <h3>事件</h3>
          <div className={styles.eventList}>
            {trace.events.map((event) => (
              <article className={styles.event} key={event.event_id}>
                <header><strong>{event.name}</strong><span className={styles.artifactMeta}>{new Date(event.occurred_at).toLocaleString("zh-CN")}</span></header>
                {Object.keys(event.attributes).length > 0 ? <p>{pretty(event.attributes)}</p> : null}
              </article>
            ))}
          </div>
        </details>
      </div>
    </main>
  );
}
