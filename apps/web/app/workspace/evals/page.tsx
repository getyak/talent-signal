import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EvalTraceCapture } from "@/components/eval-trace-capture";
import { EvalAgentLab } from "@/components/eval-agent-lab";
import { EvalTraceList } from "@/components/eval-trace-list";
import styles from "@/components/eval-workbench.module.css";
import { loadTelemetryTraces } from "@/lib/server/telemetryBackend";
import { loadEvalAgentLab } from "@/lib/server/pursuitBackend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "评估追踪",
  description: "账号范围内的智能助理追踪、受治理制品与评估依据。",
  robots: { follow: false, index: false },
};

export default async function EvalWorkbenchPage() {
  if (!(await auth())?.user) redirect("/login?callbackUrl=%2Fworkspace%2Fevals");
  let traces: Awaited<ReturnType<typeof loadTelemetryTraces>>["traces"] = [];
  let lab: Awaited<ReturnType<typeof loadEvalAgentLab>> | null = null;
  let error: string | null = null;
  try {
    const [traceResult, labResult] = await Promise.all([
      loadTelemetryTraces(),
      loadEvalAgentLab(),
    ]);
    traces = traceResult.traces;
    lab = labResult;
  } catch {
    error = "账号范围内的追踪存储不可用，未使用测试追踪替代。";
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>智能助理质量系统</p>
          <h1>评估追踪</h1>
          <p>
            跟踪一次交互如何经过界面、后端、模型、工具、验证与结果。内容保持受治理，遥测保持可检查。
          </p>
        </div>
        <span className={styles.health}>{error ? "采集器不可用" : "采集器已连接"}</span>
      </header>
      {lab ? <EvalAgentLab provider={lab.provider} targets={[...lab.targets]} /> : null}
      <section className={styles.grid}>
        <EvalTraceCapture />
        <div className={styles.tracePanel}>
          <header className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>账号追踪索引</p>
              <h2>最近执行</h2>
            </div>
            <span>{traces.length} 条追踪</span>
          </header>
          {error ? <p className={styles.empty}>{error}</p> : traces.length === 0 ? (
            <p className={styles.empty}>尚无追踪。请采集一次合成交互来验证管线。</p>
          ) : (
            <EvalTraceList traces={traces} />
          )}
        </div>
      </section>
    </main>
  );
}
